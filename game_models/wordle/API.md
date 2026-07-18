# Wordle Model API

A text-friendly, serializable model of Wordle, built to be driven programmatically (e.g. by an LLM) and persisted to a database.

> These are the members of the exported `Wordle` **class** (not HTTP endpoints). Import it and call it directly:
>
> ```ts
> import { Wordle } from "./wordle";
> const game = new Wordle();
> ```

Every read-side accessor comes in a pair: a **formatted** version returning a `string` (print it / pass it to an LLM) and a **structured** version returning an object (store it / process it).

| Concept | Formatted (string) | Structured (object) |
|---|---|---|
| Board | `formattedBoard` | `board` |
| Keyboard | `formattedLetters` | `letters` |
| Whole game | `formattedState()` | `getState()` |

---

## Rules baked in

- The secret answer is a random 5-letter word from the official answer list (`wordle_answers.txt`).
- A guess is accepted only if it is a real word in the combined list (answers ∪ `wordle_allowed_guesses.txt`, ~12,970 words).
- Six tries. The game ends on a correct guess (win) or when all six tries are used (loss).
- `Wordle.MAX_TRIES` = `6`, `Wordle.WORD_LENGTH` = `5` (static constants).

---

## Constructing a game

### `new Wordle(answer?: string)`

Creates a new game. With no argument, a random answer is chosen. Pass a word to force a specific answer (deterministic tests / seeded play). Input is case-insensitive.

```ts
const game = new Wordle();          // random secret word
const seeded = new Wordle("slate"); // secret word forced to SLATE
```

### `Wordle.fromState(state): Wordle` — *static*

Rebuilds a game from a persisted snapshot (e.g. a DB row). Only `answer` and `guesses` are read; the colours are re-scored from them, so it works even if the word lists were regenerated since the game was saved (stored guesses are trusted, not re-validated).

```ts
type MinimalState = { answer: string; guesses: readonly string[] };

const game = Wordle.fromState({ answer: "SLATE", guesses: ["CRANE", "PLATE"] });
// You can also pass a full GameState object from getState() — extra fields are ignored.
```

---

## Playing

### `guessWord(guess: string): boolean`

Submits a guess. Returns:

- `true` — the guess was **accepted and scored** (it counts as one of the six tries).
- `false` — the guess was **rejected** and **no try was consumed**. Rejected when: the game is already over, the guess isn't exactly 5 letters, it contains non-letters, or it isn't a recognised word.

Input is case-insensitive. Winning is reported separately via `isWon`.

```ts
game.guessWord("crane"); // true  — scored, one try used
game.guessWord("xyz");   // false — too short, no try used
game.guessWord("zzzzz"); // false — not a real word, no try used
```

### `restartGame(): void`

Clears the board and picks a fresh random answer. Same game object, new round.

```ts
game.restartGame();
```

---

## Reading state — formatted (string) views

Use these to print to a terminal or hand to an LLM.

### `get formattedBoard: string`

The board as an aligned text grid of the guesses so far. Returns `"No guesses yet."` before the first guess.

```ts
console.log(game.formattedBoard);
// Word 1:  | C      | R      | A      | N      | E      |
// Color 1: | Gray   | Gray   | Green  | Gray   | Green  |
```

### `get formattedLetters: string`

The keyboard: letters grouped by best-known status, with aligned labels. Empty groups show `—`.

```ts
console.log(game.formattedLetters);
// Unused: B D F G H I J K L M O P Q S T U V W X Y Z
// Green:  A E
// Yellow: —
// Gray:   C N R
```

### `formattedState(): string`

The whole game in one string: a status line, the board, and (while the game is live) the keyboard. The single best thing to hand an LLM each turn.

```ts
console.log(game.formattedState());
// Turn 2 of 6 — 5 tries left
//
// Word 1:  | C      | R      | A      | N      | E      |
// Color 1: | Gray   | Gray   | Green  | Gray   | Green  |
//
// Unused: B D F G H I J K L M O P Q S T U V W X Y Z
// Green:  A E
// Yellow: —
// Gray:   C N R
```

> Once the game is over, the status line reveals the answer (e.g. `Won in 2 tries! The word was SLATE.`). It stays hidden while the game is live, so it's safe to show a player mid-game.

---

## Reading state — structured (object) views

Use these to store in a DB or process programmatically. Every one returns copies, so mutating the result never affects the game.

### `get board: GuessRow[]`

The structured form of `formattedBoard`: every guess so far with its per-letter colours.

```ts
game.board;
// [{ guess: "CRANE", states: ["Gray","Gray","Green","Gray","Green"] }]
```

### `get lastGuess: GuessRow | null`

The most recent scored guess with its colours, or `null` if none yet. Handy for returning just the latest turn's result via an API.

```ts
game.lastGuess;
// { guess: "CRANE", states: ["Gray","Gray","Green","Gray","Green"] }
```

### `get letters: LetterGroups`

The current keyboard as structured buckets (the object form of `formattedLetters`). Each of the 26 letters lands in exactly one group by its best status (Green > Yellow > Gray; untouched = `unused`), and each group is alphabetical.

```ts
game.letters;
// { unused: ["B","D",...], green: ["A","E"], yellow: [], gray: ["C","N","R"] }
```

### `getState(): GameState`

A full structured snapshot of the game — persist it to a DB row and/or return it from an API. Round-trips through `Wordle.fromState`. See [`GameState`](#gamestate) for the fields.

```ts
const state = game.getState();
await db.save(id, { answer: state.answer, guesses: state.guesses }); // canonical
```

### `toJSON(): GameState`

Alias for `getState()`, so `JSON.stringify(game)` produces the snapshot automatically.

```ts
const row = JSON.stringify(game); // same object as getState()
```

---

## Status flags & scalars

| Accessor | Type | Meaning |
|---|---|---|
| `isWon` | `boolean` | A scored guess exactly matched the answer. |
| `isLost` | `boolean` | Game over without a win (all six tries used). |
| `isGameOver` | `boolean` | `isWon || guessesMade === 6`. |
| `guessesMade` | `number` | Guesses scored so far (0–6). |
| `triesRemaining` | `number` | Tries left (6–0). |
| `currentTurn` | `number` | 1-indexed turn about to be played (`guessesMade + 1`). |
| `solution` | `string \| null` | The answer — `null` until the game is over, then revealed. |

```ts
while (!game.isGameOver) { /* ... play ... */ }
console.log(game.isWon ? "Won!" : `Lost — answer was ${game.solution}`);
```

---

## Types

### `LetterState`
```ts
type LetterState = "Green" | "Yellow" | "Gray";
```
`Green` = right letter, right spot. `Yellow` = in the word, wrong spot. `Gray` = not in the word (at this position / count).

### `GuessRow`
```ts
interface GuessRow {
  readonly guess: string;              // uppercase, 5 letters
  readonly states: readonly LetterState[]; // length 5, aligned to guess
}
```

### `LetterGroups`
```ts
interface LetterGroups {
  unused: string[]; // not guessed yet
  green:  string[]; // correct spot at least once
  yellow: string[]; // in the word but only ever wrong spot (never green)
  gray:   string[]; // guessed and confirmed absent (never green/yellow)
}
```
The four groups partition all 26 letters; each is alphabetical.

### `GameState`
```ts
interface GameState {
  answer: string;                 // the secret word — SERVER-SIDE ONLY
  guesses: string[];              // words played, in order (canonical)
  board: GuessRow[];              // per-turn grid (derived)
  keyboardByTurn: LetterGroups[]; // keyboard after each turn; index i = after guess i+1 (drives replays)
  guessesMade: number;
  triesRemaining: number;
  currentTurn: number;
  isWon: boolean;
  isLost: boolean;
  isGameOver: boolean;
}
```

- **Canonical fields:** `answer` + `guesses` are all you need to fully reconstruct a game via `Wordle.fromState`. Everything else is derived and included so the snapshot can be returned/rendered without recomputation.
- **Do not leak `answer`:** it's the secret word. Keep it server-side; strip it before sending the snapshot to a live player (send `board` + the flags + `solution` instead).
- **Replays:** `keyboardByTurn[i]` is the keyboard exactly as it stood after turn `i+1`, so a frontend can render turn `i` from `board[i]` + `keyboardByTurn[i]` with no letter logic of its own.

---

## Common flows

### Interactive / LLM loop

```ts
import { Wordle } from "./wordle";

const game = new Wordle();
while (!game.isGameOver) {
  const guess = chooseGuess(game.formattedState()); // your player / the LLM
  if (!game.guessWord(guess)) continue;             // rejected → try again, no try used
}
console.log(game.isWon ? "Won!" : `Lost — answer was ${game.solution}`);
```

### DB persistence + per-turn API response

```ts
// resume from a stored row
const game = Wordle.fromState(row); // row = { answer, guesses }

// play a turn
if (!game.guessWord(guess)) return { error: "not a valid word" };

// persist canonical state back
const state = game.getState();
await db.update(id, { answer: state.answer, guesses: state.guesses });

// return colours to the client — strip the answer while the game is live
return {
  colours: game.lastGuess,        // just this turn: { guess, states }
  board: state.board,             // full history if re-rendering
  keyboardByTurn: state.keyboardByTurn,
  isWon: state.isWon,
  isGameOver: state.isGameOver,
  triesRemaining: state.triesRemaining,
  solution: game.solution,        // null until the game ends
};
```

---

## Quick reference

| Member | Kind | Returns |
|---|---|---|
| `new Wordle(answer?)` | constructor | `Wordle` |
| `Wordle.fromState(state)` | static | `Wordle` |
| `guessWord(guess)` | method | `boolean` |
| `restartGame()` | method | `void` |
| `formattedBoard` | getter | `string` |
| `formattedLetters` | getter | `string` |
| `formattedState()` | method | `string` |
| `board` | getter | `GuessRow[]` |
| `lastGuess` | getter | `GuessRow \| null` |
| `letters` | getter | `LetterGroups` |
| `getState()` | method | `GameState` |
| `toJSON()` | method | `GameState` |
| `isWon` / `isLost` / `isGameOver` | getter | `boolean` |
| `guessesMade` / `triesRemaining` / `currentTurn` | getter | `number` |
| `solution` | getter | `string \| null` |
| `Wordle.MAX_TRIES` / `Wordle.WORD_LENGTH` | static | `number` |
