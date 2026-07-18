// Example: play the Imposter game interactively in the terminal, driving all
// six seats yourself (a "hotseat" game).
//
// Run it with:
//   npx tsx play.ts
//
// Each turn shows the acting seat its role-safe view (Crew see the word; the
// Imposter sees only its hint) and prompts for the phase-appropriate action:
// a clue, a vote, a defense (with a point), a rebuttal, or the steal guess.
// Type 'quit' at any prompt to exit. (For a non-interactive walkthrough that
// spoils nothing, see playWalkThrough.ts.)

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Imposter, type Seat } from "./imposter";

const rl = createInterface({ input, output });
const rule = () => console.log("─".repeat(64));
const isQuit = (s: string) => s.trim().toLowerCase() === "quit" || s.trim().toLowerCase() === "exit";
const SEATS: Seat[] = ["P1", "P2", "P3", "P4", "P5", "P6"];
const asSeat = (s: string): Seat | null => (SEATS.includes(s.trim().toUpperCase() as Seat) ? (s.trim().toUpperCase() as Seat) : null);

async function main(): Promise<void> {
  console.log("=== Imposter (hotseat — you play all six seats) ===");
  console.log("5 Crew share a secret word; 1 is the Imposter with only a hint. Type 'quit' to exit.\n");

  const game = new Imposter();

  while (!game.isGameOver) {
    const seat = game.playersToAct()[0];
    if (!seat) break;

    rule();
    console.log(game.formattedState(seat) + "\n");
    const phase = game.currentPhase;

    if (phase === "clue") {
      const ans = await rl.question(`${seat}, your one-word clue: `);
      if (isQuit(ans)) break;
      if (!game.clue(seat, ans)) console.log("  ✗ Must be a single word (letters only). Try again.\n");
    } else if (phase === "accuse" || phase === "final") {
      const ans = await rl.question(`${seat}, ${phase === "accuse" ? "vote for a suspect" : "final vote to eliminate"} (P1–P4, not yourself): `);
      if (isQuit(ans)) break;
      const target = asSeat(ans);
      if (!target || !game.vote(seat, target)) console.log("  ✗ Pick another player (P1–P4, not yourself).\n");
    } else if (phase === "accuse-tiebreak" || phase === "final-tiebreak") {
      const ans = await rl.question(`${seat}, you're tied — defend yourself: `);
      if (isQuit(ans)) break;
      game.defend(seat, ans);
    } else if (phase === "defense") {
      const msg = await rl.question(`${seat}, you're accused — your defense: `);
      if (isQuit(msg)) break;
      const point = await rl.question(`${seat}, point at a suspect (P1–P4, not yourself): `);
      if (isQuit(point)) break;
      const target = asSeat(point);
      if (!target || !game.defend(seat, msg, target)) console.log("  ✗ You must point at another player (P1–P4). Try again.\n");
    } else if (phase === "rebuttal") {
      const ans = await rl.question(`${seat}, you were pointed at — your defense: `);
      if (isQuit(ans)) break;
      game.defend(seat, ans);
    } else if (phase === "steal") {
      const ans = await rl.question(`${seat} (the Imposter, caught!) — guess the secret word to steal the win: `);
      if (isQuit(ans)) break;
      game.guessWord(ans);
    }
  }

  rule();
  if (game.isGameOver) {
    const s = game.getState();
    console.log(`\nGAME OVER — ${game.winner!.toUpperCase()} wins (${game.endReason}).`);
    console.log(`The word was "${s.word}"; the imposter was ${s.imposter}.\n`);
    console.log(game.formattedLog);
  } else {
    console.log("\nBye!");
  }
  rl.close();
}

main();
