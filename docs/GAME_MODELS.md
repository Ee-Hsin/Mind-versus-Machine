# Game Models

Text-friendly, serializable models of three games — **Wordle**, **Codenames**, and **Imposter** — built to be driven programmatically (e.g. by LLMs). Each model maintains hidden state, enforces the rules/turn flow, and renders both plain-text views (to hand to a model or print) and structured objects (for a DB or programmatic use). Every game is serializable so it can be persisted, replayed, or spectated.

The rules for each game live inside its package under `packages/games/<game>/src/`,
alongside the adapter and match definition that wire them to the engine. The rules
themselves import nothing outside their own directory, so they stay runnable without
Next.js, Supabase, or a network.

```
packages/games/wordle/
├── src/
│   ├── wordle.ts        Core game model (the Wordle class) + validGuesses()
│   ├── wordleWords.ts   Word lists  ⚠ AUTO-GENERATED
│   ├── model.ts         Package-local façade used by the adapter
│   ├── prompts.ts       System prompt + prompt version
│   ├── adapter.ts       Translation to the generic engine contracts
│   ├── definition.ts    Match format: model boards on one shared answer
│   └── index.ts         The GameModule registration
├── API.md               API reference for the core model
├── README.md
└── scripts/
    ├── wordle_answers.txt          Source answer list (editable)
    ├── wordle_allowed_guesses.txt  Source guess list (editable)
    └── generate-words.mjs          Regenerates ../src/wordleWords.ts
```

`packages/games/codenames` and `packages/games/imposter` follow the same shape.
The interactive terminal harnesses (`play.ts`, `playWalkThrough.ts`) that used to
sit beside these models were removed with the benchmarking CLI; recover them from
git history if you want to drive a model by hand.


---

## Codenames (`codenames/`)

| File | Purpose |
|------|---------|
| **`codenames.ts`** | The core game model — the `Codenames` class. Maintains the hidden 25-card board, renders **role-specific views** (spymasters see the key; operatives see only revealed cards) as both formatted text and structured objects, enforces the full turn flow (clue → guesses), and logs every clue and guess. Serializable via `getState()` / `fromState()` / `toJSON()`. This is the file you import to embed a game. |
| **`codenamesWords.ts`** | ⚠ **Auto-generated — do not edit by hand.** Exports `WORDS`, the Codenames word pool (399 words); each game draws 25 at random. Regenerate with the script below. |
| **`play.ts`** | Example: play Codenames interactively in the terminal as a "hotseat" game, driving all four roles yourself (both spymasters + both operatives). Run with `npx tsx play.ts`. |
| **`playWalkThrough.ts`** | Example: a scripted, non-interactive walkthrough of a full **seeded** game. Prints what each role sees, clue/guess results, the log, and the final state — handy for seeing the whole flow at a glance, and doubles as a usage reference (every call goes through the public API). Run with `npx tsx playWalkThrough.ts`. |
| **`API.md`** | Human-readable API reference for the `Codenames` class. |
| **`scripts/codenames_words.txt`** | The editable source word list, one word per line (399 entries). Edit this, then regenerate. |
| **`scripts/generate-words.mjs`** | Reads `codenames_words.txt`, normalizes it (trim, uppercase, drop blanks, dedupe, validate single alphabetic tokens), and writes `codenamesWords.ts`. Run with `node generate-words.mjs` from the `scripts/` folder whenever you edit the word list. |

---

## Imposter (`imposter/`)

| File | Purpose |
|------|---------|
| **`imposter.ts`** | The core game model — the `Imposter` class. 6 players (5 Crew + 1 Imposter): the Crew share a secret word, the Imposter gets only a vague hint and must bluff. Enforces the clue → accuse → defense → rebuttal → final-vote → steal phase machine (with tie re-votes), renders **role-safe views** (Crew see the word but not who the imposter is; the Imposter sees only its hint) as formatted text and structured objects, and keeps an attributed log. Serializable via `getState()` / `fromState()` / `toJSON()`. This is the file you import to embed a game. |
| **`imposterWords.ts`** | ⚠ **Auto-generated — do not edit by hand.** Exports `WORD_HINTS`, the word/hint pool (66 pairs); each game draws one at random. Regenerate with the script below. |
| **`play.ts`** | Example: play Imposter interactively in the terminal as a "hotseat" game, driving all six seats yourself. Run with `npx tsx play.ts`. |
| **`playWalkThrough.ts`** | Example: a scripted, non-interactive walkthrough of a full **seeded** game. Prints what each role sees, the clue round, the accusation/defense/rebuttal drama, the final vote, and the steal — and doubles as a usage reference. Run with `npx tsx playWalkThrough.ts`. |
| **`API.md`** | Human-readable API reference for the `Imposter` class. |
| **`scripts/imposter_words.txt`** | The editable source, one `WORD \| hint` pair per line. Edit this, then regenerate. |
| **`scripts/generate-words.mjs`** | Reads `imposter_words.txt`, normalizes/validates it (uppercase word, trimmed hint, dedupe, check the `WORD \| hint` shape), and writes `imposterWords.ts`. Run with `node generate-words.mjs` from the `scripts/` folder whenever you edit the list. |

---

## Wordle (`wordle/`)

| File | Purpose |
|------|---------|
| **`wordle.ts`** | The core game model — the `Wordle` class. Accepts guesses, scores each letter Green / Yellow / Gray, and reads the board back as plain text (board + a keyboard-status view) or structured objects. Serializable for persistence/replay. This is the file you import to embed a game. |
| **`wordleWords.ts`** | ⚠ **Auto-generated — do not edit by hand.** Exports `ANSWER_WORDS` (2,315 possible secret answers) and `ALLOWED_GUESSES` (10,657 additional words accepted as legal guesses). Regenerate with the script below. |
| **`play.ts`** | Example: play Wordle in the terminal against a random secret word. Doubles as a usage reference (uses `guessWord()`, `formattedBoard`, `formattedLetters`, the state getters, `solution`, and `restartGame()`). Run with `npx tsx play.ts`. |
| **`API.md`** | Human-readable API reference for the `Wordle` class. |
| **`scripts/wordle_answers.txt`** | The editable source list of possible secret answers, one 5-letter word per line (2,315 entries). |
| **`scripts/wordle_allowed_guesses.txt`** | The editable source list of extra words accepted as legal guesses beyond the answers, one per line (10,657 entries). |
| **`scripts/generate-words.mjs`** | Reads the two `.txt` lists, normalizes them (trim, uppercase, drop blanks, dedupe), and writes `wordleWords.ts`. Run with `node generate-words.mjs` from the `scripts/` folder whenever you edit either list. |

---

## Conventions shared by all models

- **Paired views:** every formatted-string view has a structured-object counterpart, so the same state can be printed, handed to an LLM, or stored in a DB.
- **Serializable:** `getState()` / `fromState()` (and `toJSON()`) let you persist, replay, or reconstruct a game from its moves.
- **Generated word data:** the `*Words.ts` files are build artifacts of `scripts/generate-words.mjs`. Edit the `.txt` sources and regenerate — never edit the `.ts` word files directly.
- **Running the examples:** the `play.ts` / `playWalkThrough.ts` files are TypeScript and run with a TS runner such as `npx tsx <file>`.
