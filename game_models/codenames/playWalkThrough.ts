// Example: a scripted walkthrough of a Codenames game using the CodenamesModel class.
//
// Run it with:
//   npx tsx playWalkThrough.ts
//
// This drives a full seeded game programmatically (no input) and prints what each
// role sees, the clue/guess results, the log, and the final state — handy for
// seeing the whole flow at a glance. It doubles as a usage reference — every call
// goes through the public API. For an interactive game you drive yourself, see
// play.ts.

import { CodenamesModel, type CardColor, type GuessResult } from "./codenames";

// A fixed board so the walkthrough is reproducible: indices 0-8 red, 9-16 blue,
// 17-23 neutral, 24 assassin. Red goes first.
const WORDS = [
  "ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL", "INDIA",
  "JULIET", "KILO", "LIMA", "MIKE", "NOVEMBER", "OSCAR", "PAPA", "QUEBEC",
  "ROMEO", "SIERRA", "TANGO", "UNIFORM", "VICTOR", "WHISKEY", "XRAY",
  "ZULU",
];
const KEY: CardColor[] = [
  ...Array(9).fill("red"), ...Array(8).fill("blue"), ...Array(7).fill("neutral"), "assassin",
] as CardColor[];

const game = new CodenamesModel({ words: WORDS, key: KEY, startingTeam: "red", moves: [] });

function section(title: string): void {
  console.log("\n" + "=".repeat(60) + "\n" + title + "\n" + "=".repeat(60));
}

/** Give the current team's clue and narrate it. */
function clue(word: string, number: number): void {
  const ok = game.giveClue(word, number);
  console.log(`\n${game.currentTeam.toUpperCase()} spymaster clues: "${word}" ${number}  ${ok ? "" : "(REJECTED)"}`);
}

/** Guess a card and narrate the structured result. */
function guess(word: string): GuessResult {
  const r = game.guess(word);
  const detail = r.accepted
    ? `${r.color} (${r.outcome})${r.turnEnded ? " — turn ends" : ""}${r.gameOver ? ` — ${r.winner!.toUpperCase()} WINS` : ""}`
    : "rejected";
  console.log(`  guess ${word.toUpperCase().padEnd(9)} → ${detail}`);
  return r;
}

// --- The two role views --------------------------------------------------
section("What each role sees at the start");
console.log("\nSPYMASTER view (sees the key):\n");
console.log(game.formattedBoard("spymaster"));
console.log("\nOPERATIVE view (colours hidden until revealed):\n");
console.log(game.formattedBoard("operative"));
console.log(`\nTag key:  RED=RED  BLU=blue  NEU=neutral  ASN=assassin   * = already revealed`);

// --- Turn 1: red — a correct guess, then a neutral ends the turn ----------
section("Turn 1 — RED");
clue("SIGNAL", 2);      // points at 2 red cards; operatives get up to 3 guesses
guess("ALPHA");         // red  → correct, keep going
guess("ROMEO");         // neutral → turn ends, hands over to blue

// --- Turn 2: blue — one correct, then stop early --------------------------
section("Turn 2 — BLUE");
clue("WATER", 1);
guess("JULIET");        // blue → correct
game.endGuessing();     // choose to stop rather than risk a second guess
console.log("  (blue stops guessing)");

// --- Turn 3: red — sweep the rest of red's cards to win -------------------
section("Turn 3 — RED goes for the win");
clue("EVERYTHING", 7);  // gr = 8, enough to clear the 8 remaining red cards
for (const w of ["BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL", "INDIA"]) {
  if (game.isGameOver) break;
  guess(w);
}

// --- The log and final state ---------------------------------------------
section("Game log");
console.log("\n" + game.formattedLog);

section("Final state (spymaster view)");
console.log("\n" + game.formattedState("spymaster"));

// --- How you'd wire this to a DB + live UI -------------------------------
section("Persisting / serving state");
console.log(`
After every action you would:
  • save the full snapshot to the DB:      game.getState()          (has the key)
  • push a role-safe view to each client:  game.getPlayerState("operative")  // colours masked
                                            game.getPlayerState("spymaster")  // full colours
  • rebuild a stored game for replay:       CodenamesModel.fromState(row)
`);
