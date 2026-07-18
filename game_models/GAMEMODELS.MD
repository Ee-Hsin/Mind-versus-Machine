# Game Models

Text-friendly, serializable models of two games — **Wordle** and **Codenames** — built to be driven programmatically (e.g. by LLMs). Each model maintains hidden state, enforces the rules/turn flow, and renders both plain-text views (to hand to a model or print) and structured objects (for a DB or programmatic use). Every game is serializable so it can be persisted, replayed, or spectated.

Each game lives in its own self-contained folder; all imports are relative within the folder, so a folder can be copied or run on its own.

```
game_models/
├── codenames/
│   ├── codenames.ts          Core game model (the Codenames class)
│   ├── codenamesWords.ts      Word pool  ⚠ AUTO-GENERATED
│   ├── play.ts                Interactive terminal game
│   ├── playWalkThrough.ts     Scripted, non-interactive walkthrough
│   ├── API.md                 API reference
│   └── scripts/
│       ├── codenames_words.txt   Source word list (editable)
│       └── generate-words.mjs    Regenerates codenamesWords.ts
└── wordle/
    ├── wordle.ts              Core game model (the Wordle class)
    ├── wordleWords.ts         Word lists  ⚠ AUTO-GENERATED
    ├── play.ts                Interactive terminal game
    ├── API.md                 API reference
    └── scripts/
        ├── wordle_answers.txt          Source answer list (editable)
        ├── wordle_allowed_guesses.txt  Source allowed-guess list (editable)
        └── generate-words.mjs          Regenerates wordleWords.ts
```

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

## Conventions shared by both models

- **Paired views:** every formatted-string view has a structured-object counterpart, so the same state can be printed, handed to an LLM, or stored in a DB.
- **Serializable:** `getState()` / `fromState()` (and `toJSON()`) let you persist, replay, or reconstruct a game from its moves.
- **Generated word data:** the `*Words.ts` files are build artifacts of `scripts/generate-words.mjs`. Edit the `.txt` sources and regenerate — never edit the `.ts` word files directly.
- **Running the examples:** the `play.ts` / `playWalkThrough.ts` files are TypeScript and run with a TS runner such as `npx tsx <file>`.
