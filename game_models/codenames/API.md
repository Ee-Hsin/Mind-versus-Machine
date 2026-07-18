# Codenames Model API

A text-friendly, serializable model of Codenames, built to be driven programmatically (e.g. by LLMs playing in teams) and persisted to a database. It maintains the hidden board, enforces the full turn flow, and renders **role-specific** views.

> These are the members of the exported `Codenames` **class** (not HTTP endpoints):
>
> ```ts
> import { Codenames } from "./codenames";
> const game = new Codenames();
> ```

Read-side accessors come in **formatted** (string, for printing / LLMs) and **structured** (object, for the DB / UI) pairs. Most are **role-scoped** — spymasters see the key, operatives don't.

| Concept | Formatted (string) | Structured (object) |
|---|---|---|
| Board | `formattedBoard(role)` | `board(role)` |
| Log | `formattedLog` | `log` |
| Whole game | `formattedState(role)` | `getPlayerState(role)` (live) / `getState()` (full) |

---

## Rules baked in

- 5×5 = 25 word cards. Distribution: **starting team 9, other 8, neutral 7, assassin 1**. Words are drawn from the ~400-word pool in `codenamesWords.ts`.
- A turn: the current team's **spymaster gives a clue** (a word + a number) → its **operatives guess** up to `number + 1` cards, one at a time.
  - Own-team card → correct, keep guessing. **Neutral** → turn ends. **Enemy** card → revealed for them, turn ends. **Assassin** → the guessing team **loses instantly**.
  - Operatives may stop early with `endGuessing()` (only after ≥ 1 guess).
- **Win:** a team reveals all its cards (its own guess, or the opponent revealing their last one). Assassin → the other team wins.
- `Codenames.BOARD_SIZE` = `25`.

---

## Constructing a game

### `new Codenames(options?)`

With no options, a random 25-word board, a valid random key (9/8/7/1), and a random starting team are generated. Options seed a deterministic game:

```ts
interface CodenamesOptions {
  words?: readonly string[];   // exactly 25 distinct words
  key?: readonly CardColor[];  // exactly 25 colours, aligned to words
  startingTeam?: Team;         // default random; derived from key counts if key given
}

const game = new Codenames();
const seeded = new Codenames({ words, key, startingTeam: "red" });
```

### `Codenames.fromState(state): Codenames` — *static*

Rebuilds a game from a persisted snapshot by **replaying its canonical moves** through the same rules (deterministic; guarantees a valid state). Only the canonical fields are read:

```ts
const game = Codenames.fromState({ words, key, startingTeam, moves });
// Replay to any earlier point by slicing moves:
const midGame = Codenames.fromState({ words, key, startingTeam, moves: moves.slice(0, k) });
```

---

## Actions (the turn state machine)

Out-of-phase or illegal calls are rejected without changing state.

### `giveClue(word: string, number: number): boolean`

Spymaster action, valid only in the **clue** phase. Returns `false` (no change) if: the game is over, it's not the clue phase, or the clue is illegal — it must be a **single alphabetic word**, **not a word on the board**, with **number ≥ 1**. On success the turn moves to the **guess** phase with `number + 1` guesses available.

```ts
game.giveClue("OCEAN", 2);   // true → operatives may now guess up to 3 cards
game.giveClue("blue sea", 2); // false (two words)
game.giveClue("WATER", 1);    // false if WATER is on the board
```

### `guess(word: string): GuessResult`

Operative action, valid only in the **guess** phase. Reveals a card, applies the outcome, may end the turn/game, and appends to the log.

```ts
interface GuessResult {
  accepted: boolean;   // false = rejected (wrong phase, game over, unknown/already-revealed word)
  word?: string;
  color?: CardColor;   // the revealed card's colour
  outcome?: "correct" | "wrong-team" | "neutral" | "assassin";
  turnEnded: boolean;
  gameOver: boolean;
  winner?: Team | null;
}

game.guess("water");
// → { accepted:true, word:"WATER", color:"blue", outcome:"correct", turnEnded:false, gameOver:false }
```

### `endGuessing(): boolean`

Operatives stop early and end the turn. Returns `false` unless it's the guess phase and at least one guess has been made this turn.

### `restartGame(): void`

Starts a brand-new game (fresh random words, key, and starting team).

---

## Reading state — formatted (string) views

For printing or handing to an LLM. All are role-scoped where colours matter.

### `formattedBoard(role: Role): string`

The 5×5 board as an aligned grid. Spymaster sees every colour; operative sees a colour only once a card is revealed.

```
ALPHA (RED)     BRAVO (RED)     CHARLIE (RED)   DELTA (RED)     ECHO (RED)
...
```
Tags: `RED` `BLU` `NEU` `ASN`; a trailing `*` means the card is already revealed.

### `get formattedLog: string`

The clue/guess history as text (`"No clues yet."` before the first clue):

```
Turn 1 — RED clue: SIGNAL 2
  ALPHA → red (correct)
  ROMEO → neutral (neutral)
```

### `formattedState(role: Role): string`

The whole game in one role-appropriate string — a status line, the role's board, a one-line **legend** explaining the colour tags and `*` (revealed), and the log. The single best thing to hand an LLM each turn.

---

## Reading state — structured (object) views

Every one returns copies, so mutating results never affects the game.

### `board(role: Role): (Card | PublicCard)[]`

The structured board for a role. Spymaster → `Card[]` (colours). Operative → `PublicCard[]` (unrevealed `color` is `null`).

### `get log: TurnRecord[]`

The structured clue/guess history (the last turn may still be in progress: `endedBy: null`).

### `getState(): CodenamesState`

**FULL** snapshot — for **DB persistence, replay, and spectating**. Contains the key, so it is **server-side only**. See [`CodenamesState`](#codenamesstate).

### `getPlayerState(role: Role): PlayerState`

**Role-safe** snapshot for a **live** client. Operative colours are masked and the key/moves omitted, so it is safe to push to that player. Spymaster gets full colours.

### `toJSON(): CodenamesState`

Alias for `getState()`, so `JSON.stringify(game)` yields the full snapshot.

---

## State getters

| Accessor | Type | Meaning |
|---|---|---|
| `currentTeam` | `Team` | Whose turn it is. |
| `phase` | `TurnPhase` | `"clue"` (awaiting spymaster) or `"guess"` (awaiting operatives). |
| `currentClue` | `Clue \| null` | The active clue, or `null` in the clue phase. |
| `guessesRemaining` | `number` | Guesses left this turn. |
| `remaining` | `{ red; blue }` | Unrevealed cards left per team (the score). |
| `isGameOver` | `boolean` | Whether the game has ended. |
| `winner` | `Team \| null` | The winning team once over. |
| `endReason` | `"all-cards" \| "assassin" \| null` | How the game ended. |

---

## Types

```ts
type Team = "red" | "blue";
type CardColor = "red" | "blue" | "neutral" | "assassin";   // assassin = the "black" card
type Role = "spymaster" | "operative";
type TurnPhase = "clue" | "guess";
type GuessOutcome = "correct" | "wrong-team" | "neutral" | "assassin";

interface Clue { word: string; number: number; }
interface Card { readonly word: string; readonly color: CardColor; readonly revealed: boolean; }
interface PublicCard { readonly word: string; readonly revealed: boolean; readonly color: CardColor | null; }

interface GuessRecord { word: string; color: CardColor; outcome: GuessOutcome; }
interface TurnRecord {
  team: Team;
  clue: Clue;
  guesses: GuessRecord[];
  endedBy: "limit" | "neutral" | "wrong-team" | "assassin" | "stopped" | "win" | null; // null = in progress
}

type Move =
  | { type: "clue"; word: string; number: number }
  | { type: "guess"; word: string }
  | { type: "stop" };
```

### `CodenamesState`
```ts
interface CodenamesState {
  // canonical — fully reconstruct via fromState (SERVER-SIDE; contains the key)
  words: string[]; key: CardColor[]; startingTeam: Team; moves: Move[];
  // derived — for direct DB storage / spectator render
  board: Card[];                 // full colours (server-side only)
  log: TurnRecord[];
  currentTeam: Team; phase: TurnPhase; currentClue: Clue | null; guessesRemaining: number;
  remaining: { red: number; blue: number };
  isGameOver: boolean; winner: Team | null; endReason: "all-cards" | "assassin" | null;
}
```

### `PlayerState`
```ts
interface PlayerState {
  role: Role;
  board: (Card | PublicCard)[];  // operative → unrevealed colours masked
  log: TurnRecord[];             // log colours are already-revealed = public
  currentTeam: Team; phase: TurnPhase; currentClue: Clue | null; guessesRemaining: number;
  remaining: { red: number; blue: number };
  isGameOver: boolean; winner: Team | null; endReason: "all-cards" | "assassin" | null;
  // NO words / key / moves; NO hidden colours for operatives.
}
```

> **Never send `getState()` (or the key) to an operative** — use `getPlayerState("operative")`. `getState()` is for the server, the DB, replay, and spectating a finished game.

---

## Common flows

### Two LLM teams, server-side

```ts
const game = new Codenames();
while (!game.isGameOver) {
  if (game.phase === "clue") {
    const { word, number } = askSpymaster(game.formattedState("spymaster"), game.currentTeam);
    game.giveClue(word, number);
  } else {
    const r = game.guess(askOperative(game.formattedState("operative"), game.currentTeam));
    if (r.accepted && r.outcome === "correct" && wantToStop()) game.endGuessing();
  }
}
console.log(`${game.winner} wins (${game.endReason})`);
```

### Live game (humans + LLMs) with DB + per-role UI

```ts
const game = Codenames.fromState(row);          // resume, row = { words, key, startingTeam, moves }
game.giveClue("ocean", 2);                       // or game.guess(...) / game.endGuessing()

await db.save(id, game.getState());              // full snapshot (also enough to replay later)
pushToClient(spymasterConn, game.getPlayerState("spymaster")); // full colours
pushToClient(operativeConn, game.getPlayerState("operative")); // colours masked
```

### Replay a historical game

```ts
const { words, key, startingTeam, moves } = row;
for (let k = 0; k <= moves.length; k++) {
  const frame = Codenames.fromState({ words, key, startingTeam, moves: moves.slice(0, k) });
  render(frame.getState());   // full visibility is fine when spectating
}
```

---

## Quick reference

| Member | Kind | Returns |
|---|---|---|
| `new Codenames(options?)` | constructor | `Codenames` |
| `Codenames.fromState(state)` | static | `Codenames` |
| `giveClue(word, number)` | method | `boolean` |
| `guess(word)` | method | `GuessResult` |
| `endGuessing()` | method | `boolean` |
| `restartGame()` | method | `void` |
| `formattedBoard(role)` | method | `string` |
| `formattedLog` | getter | `string` |
| `formattedState(role)` | method | `string` |
| `board(role)` | method | `(Card \| PublicCard)[]` |
| `log` | getter | `TurnRecord[]` |
| `getState()` | method | `CodenamesState` |
| `getPlayerState(role)` | method | `PlayerState` |
| `toJSON()` | method | `CodenamesState` |
| `currentTeam` / `phase` / `currentClue` / `guessesRemaining` | getter | — |
| `remaining` | getter | `{ red; blue }` |
| `isGameOver` / `winner` / `endReason` | getter | — |
| `Codenames.BOARD_SIZE` | static | `number` |
