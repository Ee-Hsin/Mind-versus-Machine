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

Change the prompt-version constant whenever behaviorally meaningful prompt text
changes. Benchmarks should record engine and prompt versions from the manifest.

## Wordle handoff

Wordle uses a separate model instance for every actor and one shared answer per
match. The human and models may play concurrently. Model guesses, boards, and
commentary are postgame data until the human finishes; at that point previous
model events become visible and remaining model turns may stream normally.

The current package contains signatures and intent only. Port word validation,
letter scoring, keyboard state, formatted state, and reconstruction before match
orchestration.

## Codenames handoff

Codenames has four seats and two role projections. Spymasters see the key;
operatives see only revealed colors. Human play assigns both red seats to humans
and blue seats to the selected AI spymaster and operative. Benchmarks use two
color-swapped legs on the same board/key.

Implement the clue/guess/stop state machine in the model before adding room or
worker behavior. Treat every operative projection as a security boundary.

## Adding Imposter or another game

1. Add its config, action, public-state, and metric types to `GameSpecMap`.
2. Create a game package with the five files above and a package README.
3. Register the module in worker and CLI composition roots.
4. Add a frontend renderer/replay registration.
5. Document seats, hidden information, completion, scoring, and prompt version.

If generic code needs to branch on a game ID, first check whether the decision
actually belongs in the game definition or manifest.
