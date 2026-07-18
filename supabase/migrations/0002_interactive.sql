alter table arena_runs add column room_code text unique;

create table arena_participants (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references arena_runs(id) on delete cascade,
  token_hash text not null unique,
  display_name text not null,
  seat_id text not null,
  ready boolean not null default false,
  is_host boolean not null default false,
  created_at timestamptz not null default now(),
  unique (run_id, seat_id)
);

create index arena_participants_run_idx on arena_participants(run_id);

create table arena_human_turns (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references arena_runs(id) on delete cascade,
  game_id text not null,
  turn_number int not null,
  seat_id text not null,
  status text not null default 'pending' check (status in ('pending','submitted','consumed','cancelled')),
  action jsonb,
  idempotency_key text,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (run_id, game_id, turn_number, seat_id),
  unique (run_id, idempotency_key)
);

create index arena_human_turns_pending_idx on arena_human_turns(run_id, seat_id) where status = 'pending';

create or replace function submit_arena_human_action(
  target_run_id uuid, target_turn_id uuid, participant_token_hash text,
  submitted_action jsonb, submitted_idempotency_key text
) returns arena_human_turns
language plpgsql security definer as $$
declare result arena_human_turns;
begin
  update arena_human_turns t set action = submitted_action, idempotency_key = submitted_idempotency_key,
    status = 'submitted', submitted_at = now()
  where t.id = target_turn_id and t.run_id = target_run_id and t.status = 'pending'
    and exists (select 1 from arena_participants p where p.run_id = t.run_id
      and p.seat_id = t.seat_id and p.token_hash = participant_token_hash)
  returning t.* into result;
  if result.id is null then raise exception 'turn_not_pending_or_unauthorized'; end if;
  return result;
end;
$$;
