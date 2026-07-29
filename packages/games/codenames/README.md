# Codenames package

This package owns the Codenames state machine, hidden information, role prompts,
match format, and scoring. The generic engine should only see typed actions and
role-safe projections.

## Intended match shape

- Four seats: red/blue spymaster and operative.
- Human play assigns both red seats to humans and the two selected models to the
  blue spymaster and operative seats.
- Spymasters see the key; operatives see colors only after cards are revealed.
- Actions are `{ type: "clue" }`, `{ type: "guess" }`, and `{ type: "stop" }`.
- A fair head-to-head plays two legs on the same board/key with colours swapped.

## Teammate handoff

1. Port board generation, clue validation, guessing, stopping, and serialization
   into `model.ts`.
2. Confirm both role prompts and increment `CODENAMES_PROMPT_VERSION` on change.
3. Human-team play still needs porting onto the live-play stack (UI in `parked/`).
4. Audit every projection to ensure operatives never receive hidden colors.

Open decisions: scoring beyond win/loss and how much model commentary
to reveal during play versus after the shared game ends.
