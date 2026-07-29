# Game development

## The game module pattern

Every game follows the same five-part shape without forcing the same gameplay:

| File | Owns |
| --- | --- |
| `model.ts` | Pure rules, canonical state, reconstruction, and role-safe views |
| `prompts.ts` | System prompts and an explicit prompt version |
| `adapter.ts` | The translation between the model and generic engine contracts |
| `definition.ts` | Actors, match/fixture format, scoring, and event visibility |
| `index.ts` | The complete `GameModule` registration |

The model should be runnable without Next.js, Supabase, or an LLM. The adapter
hands formatted state to a model player and applies only structured actions.

## Prompts and turns

Prompts stay next to the game because they encode rules and role knowledge. A
model turn consists of:

1. A game/role system prompt from `systemPromptFor`.
2. A formatted, secret-safe state from `viewFor`.
3. A structured decision schema with short generated commentary and one move.
4. Game-model validation through `applyAction`.
5. At most three retries with the rejection message added to the next prompt.
   This budget is right for a model emitting malformed output and wrong for a
   human typo, which is why human seats bypass it.

Change the prompt-version constant whenever behaviorally meaningful prompt text
changes. The manifest's engine and prompt versions identify how a result was
produced.

## Wordle

Every actor gets its own model instance against one shared answer, and the human
plays concurrently with the models. Model guesses stay sealed until the human's
board ends; `apps/web/lib/arena/views.ts` is the single place that decides it.

The human seat does **not** go through `runAdapter` — a human guess is
request/response, so the guess route drives a plain `WordleModel` directly.

## Codenames

Four seats and two role projections: spymasters see the key, operatives see only
revealed colours. Rules and projections are complete in
`packages/games/codenames`; the UI is in `parked/` awaiting a port onto the
live-play stack. Treat every operative projection as a security boundary.

## Adding Imposter or another game

1. Add its config, action, public-state, and metric types to `GameSpecMap`.
2. Create a game package with the five files above and a package README.
3. Register the module in `apps/web/lib/arena` and `apps/web/games/registry.ts`.
4. Add a frontend renderer/replay registration.
5. Document seats, hidden information, completion, scoring, and prompt version.

If generic code needs to branch on a game ID, first check whether the decision
actually belongs in the game definition or manifest.
