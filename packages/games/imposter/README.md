# Imposter package

This package adapts the Imposter game to the generic engine contracts. The pure
rules live in `src/imposter.ts` and are imported unchanged; everything here
is the translation layer (the generic engine only ever sees typed actions and
role-safe projections).

## Intended match shape

- Six seats, `P1`–`P6`; five are Crew, one is the Imposter (assigned at random).
- Crew share a secret word; the Imposter sees only a vague hint.
- Two clue laps (one word each, randomized order) → accusation vote → the accused
  defends and points at another player → that player rebuts → final vote.
- Tied votes trigger a defend + re-vote round (at most twice, then earliest seat).
- A crew member voted out → Imposter wins; the Imposter voted out → it may guess
  the word to steal the win.
- Actions are `{ type: "clue" }`, `{ type: "vote" }`, `{ type: "defend" }`, and
  `{ type: "guess" }`. Models return actions directly; reasoning is not streamed.
- Play mode seats the human at `P1` and alternates two selected models across `P2`-`P6`.
  One random game runs across six seats.

## Files

| File | Owns |
| --- | --- |
| `src/model.ts` | Package-local façade over the pure model in `src/imposter.ts` (`apply`, `formattedState`, role-safe `publicState`, `serialize`). |
| `src/prompts.ts` | Role system prompts (crew vs imposter) and `IMPOSTER_PROMPT_VERSION`. |
| `src/adapter.ts` | Translates seats/actions between the model and the generic `GameAdapter` contract; role-safe projections. |
| `src/definition.ts` | Match orchestration via `runAdapter`, plus per-seat metrics. |
| `src/index.ts` | The `GameModule` registration (manifest, schemas, definition). |

## Notes

- Every `publicStateFor` projection is a security boundary: Crew never learn who
  the Imposter is, and the Imposter never sees the word, until the game ends.
- The seat→role mapping is hidden (roles aren't encoded in seat names), so the
  adapter asks the model for the acting seat's role when building its prompt.
