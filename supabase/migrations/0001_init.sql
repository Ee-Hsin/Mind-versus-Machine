-- Mind versus Machine — complete schema. Run once on a fresh project.
--
-- Live play is driven in-memory over SSE, so Postgres is never in the latency
-- path. These tables serve only durable purposes: resuming an interrupted game,
-- replaying a finished one, and scoring the leaderboard.

-- --- Identity ----------------------------------------------------------------

-- A player is an opaque token in a cookie. Only the hash is stored, so a leaked
-- database cannot be used to impersonate anyone. user_id is the seam for real
-- accounts later: signing up attaches an existing anonymous row rather than
-- starting fresh, so history and leaderboard stats carry over.
create table arena_players (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  display_name text not null,
  user_id uuid,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- --- Games -------------------------------------------------------------------

create table arena_games (
  id uuid primary key default gen_random_uuid(),
  game_type text not null check (game_type in ('wordle', 'codenames', 'imposter')),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'forfeited', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  -- An unfinished game past this point is swept and auto-forfeited, so a player
  -- who cleared their cookie cannot be blocked from playing forever by a game
  -- nobody holds the token to quit.
  expires_at timestamptz not null default now() + interval '24 hours'
);

create index arena_games_sweep_idx on arena_games (expires_at) where status = 'in_progress';

-- One row per seat. outcome is per-participant rather than per-game on purpose:
-- when a human forfeits, their row is excluded from human stats while the model
-- rows in the same game still count. A null outcome means the board never
-- settled (still running, or killed by a restart) and is never counted.
create table arena_game_participants (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references arena_games(id) on delete cascade,
  seat_id text not null,
  actor_kind text not null check (actor_kind in ('human', 'model')),
  player_id uuid references arena_players(id) on delete set null,
  model_id text,
  -- Captured at game time so a replay shows the name as it was then.
  display_name text not null,
  outcome text check (outcome in ('won', 'lost', 'forfeited', 'abandoned')),
  created_at timestamptz not null default now(),
  unique (game_id, seat_id),
  constraint participant_actor_shape check (
    (actor_kind = 'human' and player_id is not null and model_id is null) or
    (actor_kind = 'model' and model_id is not null and player_id is null)
  )
);

-- Finding a player's in-progress game (the must-quit-first rule).
create index arena_game_participants_player_idx
  on arena_game_participants (player_id) where player_id is not null;
-- Leaderboard scan: settled boards, grouped by actor.
create index arena_game_participants_scoring_idx
  on arena_game_participants (actor_kind, model_id) where outcome is not null;

-- --- Wordle ------------------------------------------------------------------

-- The answer is the game's secret. It never appears in a live client response;
-- the API only includes it once the human's board is over.
create table wordle_games (
  game_id uuid primary key references arena_games(id) on delete cascade,
  answer text not null check (char_length(answer) = 5)
);

-- Every attempt by every seat, in order. This one table backs all three durable
-- purposes: resume (the human's accepted rows rebuild the board), replay (all
-- seats ordered by created_at gives the interleaved timeline), and the
-- leaderboard (wins, guesses, invalid rate, latency, and tokens are aggregates).
--
-- turn_number is an ATTEMPT index, not a 1-6 board slot: a rejected guess gets
-- its own row and the board is `where accepted`. That is what preserves a
-- comparable invalid-word rate between humans and models.
create table wordle_turns (
  id bigint generated always as identity primary key,
  game_id uuid not null references arena_games(id) on delete cascade,
  seat_id text not null,
  turn_number int not null check (turn_number >= 1),
  guess text not null check (char_length(guess) between 1 and 24),
  states text[] not null default '{}',
  accepted boolean not null,
  latency_ms int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, seat_id, turn_number),
  -- An accepted guess is always a scored five-letter word.
  constraint accepted_turn_is_scored check (
    not accepted or (char_length(guess) = 5 and array_length(states, 1) = 5)
  )
);

-- Replay reads a whole game in wall-clock order.
create index wordle_turns_replay_idx on wordle_turns (game_id, created_at);

-- --- Leaderboard input -------------------------------------------------------

-- Collapses turn rows into one row per settled board, which is the shape the
-- scoring code already consumes. Forfeited and abandoned participants are
-- filtered out here, so exclusion is enforced in one place rather than at every
-- call site — and note the filter is on the PARTICIPANT, not the game, so the
-- model boards from a game a human quit still count.
create view wordle_participant_results
with (security_invoker = true) as
select
  p.game_id,
  p.seat_id,
  p.actor_kind,
  p.model_id,
  (p.outcome = 'won') as won,
  count(t.id) filter (where t.accepted) as guesses,
  count(t.id) filter (where not t.accepted) as invalid_actions,
  coalesce(sum(t.latency_ms), 0) as latency_ms,
  coalesce(sum(t.input_tokens), 0) as input_tokens,
  coalesce(sum(t.output_tokens), 0) as output_tokens,
  (array_agg(t.guess order by t.turn_number) filter (where t.accepted))[1] as starter_word,
  g.completed_at
from arena_game_participants p
join arena_games g on g.id = p.game_id
left join wordle_turns t on t.game_id = p.game_id and t.seat_id = p.seat_id
where g.game_type = 'wordle'
  and p.outcome in ('won', 'lost')
group by p.game_id, p.seat_id, p.actor_kind, p.model_id, p.outcome, g.completed_at;

-- --- Multi-table operations --------------------------------------------------

-- Creating a game touches three tables; doing it in one statement avoids the
-- orphan rows a partially-failed sequence of client calls would leave behind.
create function create_wordle_game(
  p_player_id uuid,
  p_display_name text,
  p_answer text,
  p_models jsonb
) returns arena_games
language plpgsql security definer as $$
declare
  created arena_games;
  model jsonb;
begin
  insert into arena_games (game_type) values ('wordle') returning * into created;
  insert into wordle_games (game_id, answer) values (created.id, upper(p_answer));
  insert into arena_game_participants (game_id, seat_id, actor_kind, player_id, display_name)
    values (created.id, 'human', 'human', p_player_id, p_display_name);
  for model in select * from jsonb_array_elements(p_models) loop
    insert into arena_game_participants (game_id, seat_id, actor_kind, model_id, display_name)
      values (created.id, model->>'id', 'model', model->>'id', model->>'displayName');
  end loop;
  return created;
end;
$$;

-- Quitting. Idempotent: a double-clicked button returns the game unchanged
-- rather than erroring. Deliberately does NOT touch model participants — their
-- boards keep running and keep counting.
create function forfeit_game(p_game_id uuid, p_player_id uuid)
returns arena_games
language plpgsql security definer as $$
declare
  result arena_games;
begin
  if not exists (
    select 1 from arena_game_participants
    where game_id = p_game_id and player_id = p_player_id and actor_kind = 'human'
  ) then
    raise exception 'not_a_participant';
  end if;

  update arena_game_participants
    set outcome = 'forfeited'
    where game_id = p_game_id and player_id = p_player_id and outcome is null;

  update arena_games
    set status = 'forfeited', updated_at = now(), completed_at = coalesce(completed_at, now())
    where id = p_game_id and status = 'in_progress';

  select * into result from arena_games where id = p_game_id;
  return result;
end;
$$;

-- The 24h sweep. Reclaims games whose player never came back — including the
-- common case of a cleared cookie, where nobody holds the token to quit.
create function expire_stale_games()
returns int
language plpgsql security definer as $$
declare
  swept int;
begin
  with stale as (
    update arena_games
      set status = 'forfeited', updated_at = now(), completed_at = coalesce(completed_at, now())
      where status = 'in_progress' and expires_at < now()
      returning id
  )
  update arena_game_participants p
    set outcome = 'abandoned'
    from stale
    where p.game_id = stale.id and p.actor_kind = 'human' and p.outcome is null;

  get diagnostics swept = row_count;
  return swept;
end;
$$;

-- --- Access ------------------------------------------------------------------

-- Deny-all by default. Every query runs through the server with the service key,
-- which bypasses RLS; no client ever talks to Postgres directly. This matters
-- most for wordle_games.answer — without RLS, anyone holding the publishable
-- anon key could read the word and the human leaderboard would be meaningless.
alter table arena_players enable row level security;
alter table arena_games enable row level security;
alter table arena_game_participants enable row level security;
alter table wordle_games enable row level security;
alter table wordle_turns enable row level security;
