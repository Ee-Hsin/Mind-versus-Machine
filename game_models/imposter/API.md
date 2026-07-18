# Imposter Model API

A text-friendly, serializable model of the 6-player word-clue **Imposter** game (a.k.a. Chameleon / "find the faker"), built to be driven programmatically (e.g. by LLMs). 5 Crew share a secret word; 1 Imposter gets only a vague hint and must bluff.

> These are the members of the exported `Imposter` **class** (not HTTP endpoints):
>
> ```ts
> import { Imposter } from "./imposter";
> const game = new Imposter();
> ```

Read-side accessors come in **formatted** (string, for printing / LLMs) and **structured** (object, for a DB / UI) forms, and are **role-safe** per seat — Crew see the word but not who the Imposter is; the Imposter sees only its hint. Per-turn *reasoning* is the runner/adapter's concern (an action-schema field it logs), not the model.

---

## Rules

- **6 players** `P1..P6`; exactly **1 Imposter** (random, seedable); the other 5 are Crew.
- **Crew** see the exact secret word; the **Imposter** sees only a vague **hint** and never the word.
- **Clues:** 2 laps, each player says **one clue word** per lap, in a **randomized speaking order** fixed at game start.
- **Accusation vote → the accused** defends and **points at another player X → X rebuts → final vote** eliminates a player.
- **Ties** (either vote): the tied players defend, then everyone re-votes (for anyone); up to **2** such rounds, then the earliest-seat tied player is chosen.
- **Resolution:** a Crew member eliminated → **Imposter wins**; the Imposter eliminated → it **guesses the word** (correct → Imposter wins/`word-stolen`, wrong → Crew win).

---

## Constructing a game

### `new Imposter(options?)`

With no options, a random word/hint pair, imposter seat, and speaking order are chosen. Options seed a deterministic game:

```ts
interface ImposterOptions {
  imposter?: Seat;        // which seat is the imposter
  word?: string;          // the secret word (Crew see it)
  hint?: string;          // the vague hint (Imposter sees it)
  speakingOrder?: Seat[];  // clue order for both laps
}

const game = new Imposter();
const seeded = new Imposter({ imposter: "P5", word: "OCEAN", hint: "very big", speakingOrder: ["P3","P6","P1","P4","P2","P5"] });
```

### `Imposter.fromState(state): Imposter` — *static*

Rebuilds a game from a persisted snapshot by **replaying its canonical moves** (deterministic). Only the canonical fields are read:

```ts
const game = Imposter.fromState({ imposter, word, hint, speakingOrder, moves });
// Scrub a replay by slicing moves:
const mid = Imposter.fromState({ imposter, word, hint, speakingOrder, moves: moves.slice(0, k) });
```

### `restartGame(): void`
Starts a fresh game (new random pair, imposter, and speaking order).

---

## Actions (the phase state machine)

Out-of-phase / wrong-seat / illegal-target calls are rejected (`false`) with no state change. Actions take **game content only** (no reasoning).

### `clue(seat, word): boolean`
Clue phase. Only the **current speaker** may play, and `word` must be a single alphabetic token.

### `vote(seat, target): boolean`
Accusation or final vote. `target` must be another player (not self). Votes are **hidden until all four are in**, then revealed and the plurality resolved (ties → tie-break rounds).

### `defend(seat, message, pointAt?): boolean`
A public defense, in three contexts by phase:
- **defense** — the accused defends and **must** `pointAt` another player.
- **rebuttal** — the pointed-at player defends (no `pointAt`).
- **accuse-/final-tiebreak** — a tied player defends before the re-vote (no `pointAt`).

### `guessWord(word): boolean`
Steal phase only — the caught Imposter guesses the secret word.

---

## Reading state — formatted (string) views

### `formattedState(seat): string`
The whole game as one **role-safe, self-describing** string for that seat: its role + word/hint, the current phase, the expected action, and the full **attributed** log. The thing to hand a player each turn.

### `get formattedLog: string`
The attributed public history as text (each clue/vote/defense labeled with the player):
```
  Clue — P2: WAVE
  ...
  Accusation vote #1: P1→P3, P2→P3, P3→P1, P4→P3 → accused: P3
  Defense — P3: "..." (points at P1)
  Rebuttal — P1: "..."
  Final vote #1: ... → eliminated: P3
  Steal — the imposter guessed "RIVER" (wrong)
```

---

## Reading state — structured (object) views

Every one returns copies. All are role-safe except `getState()`.

### `getPlayerState(seat): PlayerState`
Role-safe snapshot for one seat — Crew get `secretWord` (not who's the imposter); the Imposter gets `hint` (not the word); no pending votes or hidden roles leak. Includes the attributed `log`, `yourVote`, `accused`, `pointedAt`, `eliminated`, and (at game over) `revealedRoles`.

### `getState(): ImposterState`
**FULL** snapshot — DB persistence, replay, spectating. Contains the word, hint, and imposter, so it is **server-side only** — never send it to a live player. See [`ImposterState`](#imposterstate).

### `toJSON(): ImposterState`
Alias for `getState()`, so `JSON.stringify(game)` yields the full snapshot.

---

## State getters

| Accessor | Type | Meaning |
|---|---|---|
| `currentPhase` | `Phase` | Current phase (see below). |
| `speakingOrderList` | `Seat[]` | The clue speaking order. |
| `currentSpeaker` | `Seat \| null` | Whose clue is next (clue phase only). |
| `clues` | `Clue[]` | All clues played so far, attributed. |
| `accusedSeat` | `Seat \| null` | Who the accusation vote landed on. |
| `eliminatedSeat` | `Seat \| null` | Who the final vote eliminated. |
| `playersToAct()` | `Seat[]` | Seats that must act next (empty when over). |
| `isGameOver` | `boolean` | Whether the game has ended. |
| `winner` | `Alignment \| null` | `"crew"` / `"imposter"` once over. |
| `endReason` | `EndReason \| null` | How it ended. |

---

## Types

```ts
type Alignment = "crew" | "imposter";
type Seat = "P1" | "P2" | "P3" | "P4" | "P5" | "P6";
type Phase = "clue" | "accuse" | "accuse-tiebreak" | "defense" | "rebuttal" | "final" | "final-tiebreak" | "steal" | "gameover";
type EndReason = "crew-voted-out" | "imposter-voted-out" | "word-stolen";

interface Clue { seat: Seat; word: string; }

type Move =
  | { type: "clue"; seat: Seat; word: string }
  | { type: "vote"; seat: Seat; target: Seat }
  | { type: "defend"; seat: Seat; message: string; pointAt?: Seat }
  | { type: "guess"; word: string };
```

### `LogEntry`
```ts
type LogEntry =
  | { kind: "clue"; seat: Seat; word: string }
  | { kind: "vote"; vote: "accuse" | "final"; attempt: number; votes: Record<Seat, Seat>;
      tied: Seat[] | null; winner: Seat | null; forced: boolean }  // tied set / winner / forced = earliest-seat fallback
  | { kind: "defense"; context: "accused" | "rebuttal" | "tiebreak"; seat: Seat; message: string; pointAt: Seat | null }
  | { kind: "steal"; word: string; correct: boolean };
```

### `ImposterState`
```ts
interface ImposterState {
  // canonical — reconstruct via fromState (SERVER-SIDE; has the word + roles)
  imposter: Seat; word: string; hint: string; speakingOrder: Seat[]; moves: Move[];
  // derived
  phase: Phase; roles: Record<Seat, Alignment>; clues: Clue[]; log: LogEntry[];
  accused: Seat | null; pointedAt: Seat | null; eliminated: Seat | null; imposterGuess: string | null;
  playersToAct: Seat[]; isGameOver: boolean; winner: Alignment | null; endReason: EndReason | null;
}
```

### `PlayerState`
```ts
interface PlayerState {
  seat: Seat; role: Alignment;
  secretWord: string | null;  // Crew (and everyone at game over)
  hint: string | null;        // Imposter (and everyone at game over)
  phase: Phase; speakingOrder: Seat[]; currentSpeaker: Seat | null;
  clues: Clue[]; log: LogEntry[];   // pending votes never included
  accused: Seat | null; pointedAt: Seat | null; eliminated: Seat | null;
  yourVote: Seat | null; imposterGuess: string | null;
  revealedRoles: Record<Seat, Alignment> | null;  // at game over
  playersToAct: Seat[]; isGameOver: boolean; winner: Alignment | null; endReason: EndReason | null;
}
```

> **Never send `getState()` (or the word/imposter) to a live player** — use `getPlayerState(seat)`.

---

## Common flows

### Driving all four seats (runner-style)

```ts
const game = new Imposter();
while (!game.isGameOver) {
  const seat = game.playersToAct()[0];
  const view = game.formattedState(seat);            // role-safe prompt for this seat
  switch (game.currentPhase) {
    case "clue":  game.clue(seat, askClue(view)); break;
    case "accuse":
    case "final": game.vote(seat, askVote(view)); break;
    case "defense":   game.defend(seat, askMsg(view), askPoint(view)); break;
    case "rebuttal":
    case "accuse-tiebreak":
    case "final-tiebreak": game.defend(seat, askMsg(view)); break;
    case "steal": game.guessWord(askWord(view)); break;
  }
}
console.log(`${game.winner} wins (${game.endReason})`);
```

### Persist + serve per role

```ts
const game = Imposter.fromState(row);              // resume; row = { imposter, word, hint, speakingOrder, moves }
game.vote("P2", "P3");
await db.save(id, game.getState());                // full snapshot (also enough to replay)
pushToClient(p3, game.getPlayerState("P3"));       // imposter: hint, not the word
pushToClient(p1, game.getPlayerState("P1"));       // crew: word, not who's the imposter
```

---

## Quick reference

| Member | Kind | Returns |
|---|---|---|
| `new Imposter(options?)` | constructor | `Imposter` |
| `Imposter.fromState(state)` | static | `Imposter` |
| `clue(seat, word)` | method | `boolean` |
| `vote(seat, target)` | method | `boolean` |
| `defend(seat, message, pointAt?)` | method | `boolean` |
| `guessWord(word)` | method | `boolean` |
| `restartGame()` | method | `void` |
| `formattedState(seat)` | method | `string` |
| `formattedLog` | getter | `string` |
| `getPlayerState(seat)` | method | `PlayerState` |
| `getState()` / `toJSON()` | method | `ImposterState` |
| `playersToAct()` | method | `Seat[]` |
| `currentPhase` / `currentSpeaker` / `accusedSeat` / `eliminatedSeat` | getter | — |
| `clues` / `speakingOrderList` | getter | `Clue[]` / `Seat[]` |
| `isGameOver` / `winner` / `endReason` | getter | — |
