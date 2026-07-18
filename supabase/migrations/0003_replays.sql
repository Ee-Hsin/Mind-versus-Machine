create table arena_game_replays (
  id bigint generated always as identity primary key,
  run_id uuid not null references arena_runs(id) on delete cascade,
  match_id text not null,
  game_type text not null,
  replay jsonb not null,
  completed_at timestamptz not null default now(),
  unique (run_id, match_id)
);

create index arena_game_replays_run_idx on arena_game_replays(run_id, match_id);

create view completed_arena_runs as
select * from arena_runs where status = 'completed';
