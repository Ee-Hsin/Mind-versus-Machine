# The Intangible Game

Play Wordle against several AI models. Every board uses the same hidden word.
Human guesses are scored immediately in the application process while model
boards run in the background through OpenRouter.

## Quick start

```bash
npm install
cp .env.example .env
# Set OPENROUTER_API_KEY and choose model IDs in ARENA_MODELS.
npm run dev
```

```bash
npm run typecheck
npm run check
npm run build
npm start
```

## Runtime design

The application uses one long-running Next.js Node process.

```text
Browser ── POST /guesses ──> in-memory Wordle scoring ──> immediate response
   │
   └── GET /api/games/:id every second <── model progress

Next.js server
   ├── Map<gameId, Game>
   ├── pure Wordle rules
   ├── background model loops
   └── OpenRouter request queue
```

There is no database, account system, durable history, or server-sent event
stream. A random game ID is the only access key. Different tabs and players can
start independent games at the same time, and an unfinished game never blocks a
new one.

Games expire from memory after two hours by default. A server restart or deploy
also removes every active game. Deploy this design as one long-running process;
several stateless instances do not share game state.

## HTTP API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/catalog` | Configured OpenRouter models |
| `POST /api/games` | Create an in-memory game and start model boards |
| `GET /api/games/:id` | Poll the current game state |
| `POST /api/games/:id/guesses` | Score one human guess immediately |
| `POST /api/games/:id/forfeit` | End the human board early |
| `GET /api/wordle/allowed-guesses` | Client validation word list |

## Model behavior

Each model receives only its current Wordle board and keyboard evidence. Model
loops run in parallel, but every OpenRouter call passes through a shared request
limit. A model can submit two invalid words before its board is marked
unavailable. A failed model never stops the human or other models.

Model letters remain absent from client responses until the human wins, loses,
or quits. Tile colours and progress can still be shown while the human plays.

## Workspace

| Area | Responsibility |
| --- | --- |
| `apps/web` | Next.js UI, API, in-memory games, polling, and OpenRouter client |
| `packages/games/wordle` | Pure Wordle rules and generated word lists |
| `scripts/check-wordle-rules.ts` | Rule and concealment checks |

Edit the source word lists under `packages/games/wordle/scripts/`, then run:

```bash
node packages/games/wordle/scripts/generate-words.mjs
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Required | OpenRouter credential |
| `ARENA_MODELS` | Empty | Comma-separated OpenRouter model IDs |
| `OPENROUTER_MAX_CONCURRENT_REQUESTS` | `3` | Shared model-request limit |
| `OPENROUTER_MAX_COMPLETION_TOKENS` | `512` | Maximum output tokens, including model reasoning |
| `OPENROUTER_DEEPSEEK_MAX_COMPLETION_TOKENS` | `4096` | DeepSeek output limit, including reasoning |
| `OPENROUTER_OPENAI_MAX_COMPLETION_TOKENS` | `1024` | OpenAI output limit, including reasoning |
| `OPENROUTER_GLM_MAX_COMPLETION_TOKENS` | `2048` | GLM output limit, including reasoning |
| `OPENROUTER_GEMINI_MAX_COMPLETION_TOKENS` | `1024` | Gemini output limit, including reasoning |
| `OPENROUTER_TIMEOUT_MS` | `180000` | Maximum time for one model request |
| `GAME_LIFETIME_MS` | `7200000` | Time before an in-memory game expires |
