create table arena_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued' check (status in ('lobby','queued','running','completed','failed','cancelled')),
  config jsonb not null,
  worker_id text,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  cancellation_requested boolean not null default false,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table arena_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references arena_runs(id) on delete cascade,
  sequence int not null,
  game_type text not null,
  event_type text not null,
  audience jsonb not null,
  match_id text,
  game_id text,
  payload jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, sequence)
);

create index arena_runs_queue_idx on arena_runs (created_at) where status = 'queued';
create index arena_events_cursor_idx on arena_events (run_id, sequence);

create table arena_ratings (
  model text not null,
  game_type text not null,
  elo double precision not null default 1200,
  games_played int not null default 0,
  primary key (model, game_type)
);

create or replace function claim_next_arena_run(worker_id text)
returns setof arena_runs
language plpgsql security definer as $$
declare claimed_id uuid;
begin
  select id into claimed_id from arena_runs
  where status = 'queued' and not cancellation_requested
  order by created_at for update skip locked limit 1;
  if claimed_id is null then return; end if;
  return query update arena_runs set status = 'running', worker_id = claim_next_arena_run.worker_id,
    claimed_at = now(), heartbeat_at = now(), updated_at = now()
    where id = claimed_id returning *;
end;
$$;

alter publication supabase_realtime add table arena_events;
alter publication supabase_realtime add table arena_runs;
