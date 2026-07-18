// Example: play Codenames interactively in the terminal, driving all four roles
// yourself (both spymasters and both operatives) — a "hotseat" game.
//
// Run it with:
//   npx tsx play.ts
//
// Each turn shows the view for whoever is acting: the spymaster sees the key and
// enters a clue; the operatives see the masked board and guess one card at a time
// (or stop). It's a real random game — the starting team is a coin flip. Type
// 'quit' at any prompt to exit. (For a non-interactive walkthrough, see
// playWalkThrough.ts.)

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Codenames } from "./codenames";

const rl = createInterface({ input, output });
const rule = () => console.log("─".repeat(64));
const isQuit = (s: string) => s.toLowerCase() === "quit" || s.toLowerCase() === "exit";

async function main(): Promise<void> {
  console.log("=== Codenames (hotseat — you play all four roles) ===");
  console.log("Type 'quit' at any prompt to exit.\n");

  const game = new Codenames();

  while (!game.isGameOver) {
    rule();
    const team = game.currentTeam.toUpperCase();

    if (game.phase === "clue") {
      // Spymaster's turn: show the key, take a one-word clue + a number.
      console.log(game.formattedState("spymaster") + "\n");
      const answer = (await rl.question(`${team} SPYMASTER — clue as "word number" (e.g. ocean 2): `)).trim();
      if (isQuit(answer)) break;

      const parts = answer.split(/\s+/);
      if (parts.length !== 2 || !/^\d+$/.test(parts[1])) {
        console.log('  ✗ Enter one word then a number, e.g. "ocean 2".\n');
        continue;
      }
      if (!game.giveClue(parts[0], Number(parts[1]))) {
        console.log("  ✗ Rejected — clue must be a single word (letters only), not a word on the\n" +
                    "    board, with a number ≥ 1.\n");
        continue;
      }
    } else {
      // Operatives' turn: show the masked board, take one guess (or 'stop').
      console.log(game.formattedState("operative") + "\n");
      const answer = (await rl.question(`${team} OPERATIVE — guess a word, or 'stop' to end the turn: `)).trim();
      if (isQuit(answer)) break;

      if (answer.toLowerCase() === "stop") {
        if (!game.endGuessing()) console.log("  ✗ You must make at least one guess before stopping.\n");
        continue;
      }

      const result = game.guess(answer);
      if (!result.accepted) {
        console.log("  ✗ Not a valid guess — that word isn't on the board or is already revealed.\n");
        continue;
      }

      let line = `  → ${result.word} is ${result.color!.toUpperCase()} (${result.outcome}).`;
      if (result.gameOver) line += ` ${result.winner!.toUpperCase()} WINS!`;
      else if (result.turnEnded) line += " Turn ends.";
      else line += ` Keep guessing (${game.guessesRemaining} left) or 'stop'.`;
      console.log(line + "\n");
    }
  }

  rule();
  if (game.isGameOver) {
    console.log(`\nGame over — ${game.winner!.toUpperCase()} wins (${game.endReason}).\n`);
    console.log(game.formattedBoard("spymaster")); // reveal the full key at the end
  } else {
    console.log("\nBye!");
  }
  rl.close();
}

main();
