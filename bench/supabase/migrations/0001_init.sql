create table games (
  id uuid primary key default gen_random_uuid(),
  game_type text not null,
  player text not null,
  match_id uuid,
  status text not null default 'running',
  result jsonb,
  final_state jsonb,
  created_at timestamptz not null default now()
);

create table turns (
  id bigint generated always as identity primary key,
  game_id uuid not null references games (id),
  turn_number int not null,
  attempt int not null default 1,
  player text not null,
  prompt text not null,
  raw_output jsonb,
  action jsonb,
  accepted boolean not null,
  created_at timestamptz not null default now()
);

create index turns_game_idx on turns (game_id, turn_number);

create table ratings (
  model text not null,
  game_type text not null,
  elo double precision not null default 1200,
  games_played int not null default 0,
  primary key (model, game_type)
);

alter publication supabase_realtime add table turns;
alter publication supabase_realtime add table games;
