# Mind versus Machine

Play familiar games against leading AI models. Every game doubles as a
lightweight, transparent evaluation: humans and models solve the same puzzle and
land on the same leaderboard.

Wordle is live. Codenames and Imposter have working rules packages but are not
yet wired to the live-play stack — see [`parked/`](parked/README.md).

## Quick start

```bash
npm install
cp .env.example .env        # fill in Supabase + at least one provider key
npm run dev
```

Then apply `supabase/migrations/*.sql` in order to a fresh Supabase project.

```bash
npm run typecheck   # every workspace
npm run check       # game-rule and concealment checks, no database needed
npm run build
npm start           # production server
```

## How a game runs

One long-lived Node process serves the UI and holds live games in memory.

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

Three properties are worth knowing up front, because most of the design follows
from them:

- **The answer never reaches the browser.** The client validates words against
  the public allowed-guess list, so "not in word list" costs nothing, but colours
  come from the server. That is what keeps the human leaderboard meaningful.
- **The database is not in the latency path.** Turn rows are written behind the
  response. They exist for resume, replay, and scoring — none of which anyone is
  waiting on.
- **A board is a pure function of (answer, guesses).** Resuming after a refresh,
  an eviction, or a restart is two queries and a constructor.

## Workspace

| Area | Responsibility |
| --- | --- |
| `apps/web` | Next.js UI, HTTP API, and the live-game layer in `lib/arena` |
| `packages/protocol` | Serializable contracts shared across the boundary |
| `packages/engine` | Provider-neutral turn loop; knows no game's rules |
| `packages/model-runtime` | Vercel AI SDK and the model catalog |
| `packages/storage` | Supabase repository |
| `packages/games/*` | Rules, word lists, prompts, adapters, and match definitions |
| `parked/` | Codenames and Imposter UI, kept for the next port |

## Read next

- [Architecture](docs/ARCHITECTURE.md)
- [API and data](docs/API_AND_DATA.md)
- [Game development](docs/GAME_DEVELOPMENT.md)
- [Supabase schema](supabase/README.md)

Provider keys are read only by the server. They must never be exposed to the
browser, and neither must `SUPABASE_SECRET_KEY`.
