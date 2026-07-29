# Mind versus Machine

Play familiar games against leading AI models. Every game doubles as a
lightweight, transparent evaluation: humans and models solve the same puzzle and
land on the same leaderboard.

Wordle is live. Codenames and Imposter have complete rules packages but are not
yet wired to the live-play stack — their UI is in `parked/`.

## Quick start

```bash
npm install
cp .env.example .env        # Supabase + at least one provider key
npm run dev
```

### Supabase setup

1. Create a project. Nothing else needs enabling — no Auth, Storage, Realtime, or
   Edge Functions.
2. Paste `supabase/migrations/0001_init.sql` into the SQL Editor and run it. It is
   the whole schema in one file and requires Postgres 15+ (it sets
   `security_invoker` on a view); Supabase is 15+.
3. From **Settings → API**, copy the project URL and the **secret** /
   `service_role` key into `.env` as `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.

Those two values are the only Supabase config the code reads. There is no
client-side Supabase access, so no anon/publishable key is needed — the browser
talks only to this app's API.

```bash
npm run typecheck   # every workspace
npm run check       # game-rule + concealment assertions, no database needed
npm run build
npm start           # production server
```

## How a game runs

One long-lived Node process serves the UI, the API, and the live games. There is
no worker and no queue.

```
Browser ──POST /guesses──> scored + persisted, colours in the response
   │
   ├──local: allowed-guess-list check                    (0ms, no request)
   └──SSE /stream ──────── model board updates

                  Next.js server
                    ├─ MatchRegistry:  Map<gameId, LiveGame>
                    ├─ model seats:    wordleModule.definition.runMatch
                    ├─ human seat:     a plain WordleModel driven by POSTs
                    └─ TurnPersister ──> Postgres (resume + replay + leaderboard)
```

Most of the design follows from three properties:

- **The answer never reaches the browser.** The client validates words against
  the public allowed-guess list, so "not in word list" costs nothing, but colours
  come from the server. That is what keeps the human leaderboard meaningful.
- **The database is not in the latency path.** Turn rows are written behind the
  response. They exist for resume, replay, and scoring — nobody is waiting on them.
- **A board is a pure function of (answer, guesses).** Resuming after a refresh,
  an eviction, or a restart is two queries and a constructor.

### Why it is built this way

The previous design used Postgres as an IPC bus between the web app and a worker.
Every interaction became table rows that both sides rediscovered by polling — a
1000ms claim loop, a 500ms worker loop, and a 700ms browser loop stacked on each
other, plus a full event-history refetch twice a second. The worker already held
live game state in memory; it just had no door. This adds the door and deletes
the bus.

### The human seat is not a model player

It used to be a fake async `ModelPlayer` blocked inside `runAdapter` waiting on a
database row. A human guess is genuinely request/response, so the human's board
is now a plain `WordleModel` the guess route calls directly. Three things fall
out: rehydration is trivial, no promise dangles for a player who closed the tab,
and `runAdapter`'s three-strikes-and-abandon rule — right for a model emitting
malformed output, disastrous for a human typo — cannot reach a person at all.
That still needs solving generically before Codenames and Imposter get human
seats back.

### Concealment

Game definitions publish canonical state with real letters. Every client-facing
path goes through `toSeatView` in `apps/web/lib/arena/views.ts`, which blanks
model letters until the human's board ends. One function to audit rather than one
per route. The answer itself lives in `wordle_games.answer` and in
`LiveWordleGame`, and is attached to a response only when `revealed` is true.

## Workspace

| Area | Responsibility |
| --- | --- |
| `apps/web` | Next.js UI, HTTP API, and the live-game layer in `lib/arena` |
| `packages/protocol` | Serializable contracts that cross a boundary. No React, Supabase, providers, or game code. |
| `packages/engine` | `runAdapter`, the provider-neutral turn loop. Knows no game's rules. |
| `packages/model-runtime` | Vercel AI SDK and the model catalog |
| `packages/storage` | Supabase repository |
| `packages/games/*` | Rules, word lists, prompts, adapter, match definition |
| `parked/` | Codenames and Imposter UI, awaiting a port |

The live layer:

| File | Owns |
| --- | --- |
| `lib/arena/registry.ts` | `gameId → LiveGame` map, admission control, idle eviction, expiry sweep, SIGTERM drain |
| `lib/arena/live-wordle.ts` | One game: model boards, human board, subscribers, rehydration |
| `lib/arena/views.ts` | Projection to a client — the only place concealment is decided |
| `lib/arena/persist/wordle.ts` | Batched turn writes, off the response path |

## API

Every request body is validated with a `@ai-ramp/protocol` schema.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/catalog` | Playable game manifests and enabled models |
| `POST /api/games` | Create a Wordle game and start the model boards |
| `GET /api/games/active` | The caller's unfinished game, if any |
| `GET /api/games/:id` | Snapshot; rehydrates an evicted game from the database |
| `GET /api/games/:id/stream` | SSE: model board updates and lifecycle |
| `POST /api/games/:id/guesses` | Score one human guess; colours in the response |
| `POST /api/games/:id/rejections` | Telemetry for words the client rejected locally |
| `POST /api/games/:id/forfeit` | Quit; idempotent |
| `GET /api/wordle/allowed-guesses` | The word list the client validates against |

Two choices worth explaining. **The guess result comes back on the POST, not the
stream** — it is a direct request/response, so that is the lowest-latency path and
avoids a client correlating its own guess against a broadcast; the stream
therefore carries only model boards and closes once they finish. And
**`expectedTurn` is checked, not trusted** — it is the board row the client
believes it is filling, so a double-submitted or raced guess carries a stale value
and is refused with the real board rather than silently burning a try.

## Identity

A player is an opaque 32-byte token in an `arena_player` cookie; only its SHA-256
hash is stored. HttpOnly, SameSite=Lax, and re-issued on every resolve so it
slides forward with use.

**Cookie lifetime and game resume window are separate knobs.** The cookie is a
year — it is the identity, and a hard ceiling on resume. A game's own
`expires_at` is 24 hours and is what decides how long an unfinished board stays
playable. Conflating them is a bug.

Limits inherent to cookie identity: a different browser or device is a different
player, clearing cookies orphans an in-progress game (exactly why the sweep
exists), and a shared browser is one player. `arena_players.user_id` is the seam
for real accounts — signing up attaches the existing anonymous row so history and
stats carry over.

## Schema

| Table | Owns |
| --- | --- |
| `arena_players` | Token hash, display name, nullable `user_id` |
| `arena_games` | Type, status, timestamps, `expires_at` |
| `arena_game_participants` | One row per seat: actor kind, model or player, `outcome` |
| `wordle_games` | The answer. Server-only. |
| `wordle_turns` | Every attempt by every seat, in order |
| `wordle_participant_results` | View: one pre-aggregated row per settled board |

Three invariants that are easy to break by accident:

- **`outcome` is per participant, not per game.** A human who quits is
  `forfeited` while the models in that same game keep their `won`/`lost` results —
  and those still count. So the leaderboard reads `outcome` and **never** game
  `status`. A null outcome means the board never settled and is not counted.
- **`turn_number` counts attempts, not board rows.** A rejected guess gets its own
  row and the board is `where accepted`. That is what makes the invalid-word rate
  comparable between humans and models — and why locally-rejected human words are
  posted back as telemetry, since otherwise humans would score a perfect validity
  rate for free while models are penalised on theirs.
- **RLS is load-bearing, not decorative.** Every table has it enabled with no
  policies; the server uses the service key, which bypasses it. Without it anyone
  holding the publishable key could read `wordle_games.answer`, which is the whole
  thing the design protects.

Three operations are Postgres functions because they must be atomic:
`create_wordle_game` (three tables, no orphan rows on partial failure),
`forfeit_game` (authorise + mark human + close game; idempotent; deliberately
does not touch model participants), and `expire_stale_games` (the 24h sweep).

## Adding a game

Every game package follows the same five-file shape:

| File | Owns |
| --- | --- |
| `<game>.ts` | Pure rules, canonical state, reconstruction, role-safe views |
| `prompts.ts` | System prompts and an explicit prompt version |
| `adapter.ts` | Translation between the rules and the generic engine contracts |
| `definition.ts` | Seats, match format, scoring, event publishing |
| `index.ts` | The `GameModule` registration |

The rules must be runnable without Next.js, Supabase, or a network. A model turn
is: system prompt from `systemPromptFor`, secret-safe state from `viewFor`, a
structured action schema, validation via `applyAction`, then up to three retries
with the rejection appended. Bump the prompt version whenever prompt text changes
behaviour. If generic code wants to branch on a game id, the decision probably
belongs in that game's definition or manifest.

Word lists are generated: edit `scripts/*.txt`, then run
`node packages/games/<game>/scripts/generate-words.mjs`.

**To bring back Codenames or Imposter:** move `parked/<game>/` into
`apps/web/components/`, replace its polling `useEffect` with the SSE hook (as
`components/wordle/wordle-arena.tsx` does), and re-register the game in
`apps/web/games/registry.ts` and `apps/web/components/game-dialog.tsx`. Their
rules packages were left untouched and still compile.

## Deliberately not done yet

There is no model gateway: no per-provider rate limiting, no per-call timeout, no
circuit breaker. A hung provider currently stalls a game's model boards
indefinitely. The six configured providers shard the burst across six separate
quota pools, which is the only thing holding it together today.

Provider keys and `SUPABASE_SECRET_KEY` are read only by the server and must
never reach the browser.
