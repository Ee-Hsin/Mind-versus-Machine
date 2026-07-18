# Wordle package

This package owns every Wordle-specific decision: rules, formatted model views,
prompts, action validation, match scoring, and visibility. Generic runner code
must not inspect guesses or reproduce Wordle scoring.

## Intended match shape

- Create one isolated game per human or model using one shared answer.
- Run those games concurrently.
- Ask models for `{ reasoning, move: { guess } }` and retry rejected actions up
  to three times without consuming a Wordle guess.
- Conceal AI guesses and commentary during human play. Release their event
  history when the human finishes, even if models are still completing turns.
- For benchmarks, rank a solve above a loss and fewer guesses above more guesses.

## Teammate handoff

1. Port the answer/guess word lists and pure scoring rules into `model.ts`.
2. Confirm the prompt and increment `WORDLE_PROMPT_VERSION` when it changes.
3. Implement shared-answer play and benchmark orchestration in `definition.ts`.
4. Keep the adapter as the only bridge between the model and generic engine.

Open decisions: exact benchmark tie policy and whether model commentary should be
stored as generated commentary only or include provider reasoning events.
