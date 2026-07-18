# AI Ramp Games

AI Ramp Games is a humans-versus-AI playground for games such as Wordle,
Codenames, and Imposter. The same game modules also support informal model
benchmarks from a CLI.

This repository is currently an **architecture wireframe**. It establishes the
workspace, contracts, application boundaries, and team handoffs. The game
engines, queue worker, Supabase queries, model execution, and full UI are not
implemented yet.

## Quick start

```bash
npm install
npm run typecheck
npm run build
```

Useful entrypoints:

```bash
npm run dev:web
npm run worker
npm run cli -- --game wordle --models random-a,random-b --n 3
```

The worker and CLI intentionally print their resolved composition and exit.
They do not execute games yet.

## Workspace

| Area | Responsibility |
| --- | --- |
| `apps/web` | Next.js UI, participant cookies, and HTTP API boundary |
| `apps/worker` | Background composition root for queued play runs |
| `apps/cli` | Direct model benchmark entrypoint |
| `packages/protocol` | Serializable game, run, event, and API contracts |
| `packages/engine` | Provider-neutral orchestration interfaces |
| `packages/model-runtime` | Vercel AI SDK and model catalog boundary |
| `packages/storage` | Supabase repository boundary |
| `packages/games/*` | Rules, prompts, adapters, and match formats per game |

## Read next

- [Architecture](docs/ARCHITECTURE.md)
- [Game development](docs/GAME_DEVELOPMENT.md)
- [API and data](docs/API_AND_DATA.md)
- [Team workstreams](docs/WORKSTREAMS.md)
- [Supabase plan](supabase/README.md)

Copy `.env.example` to `.env` only when a workstream needs real services.
Provider keys belong in the worker or direct CLI environment, never the browser.

## Wireframe boundaries

- No production database migration or queue implementation.
- No complete Wordle or Codenames engine.
- No actual language-model call.
- No authentication system beyond the documented participant-token design.
- No automated tests or test framework.
- No polished frontend; the web app only proves the workspace builds.
