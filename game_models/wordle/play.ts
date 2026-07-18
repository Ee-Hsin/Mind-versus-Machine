// Example: play Wordle in the terminal using the WordleModel class.
//
// Run it with a TypeScript runner, e.g.:
//   npx tsx play.ts
//
// This doubles as a usage reference — it uses guessWord(), formattedBoard,
// formattedLetters, the state getters, solution, and WordleModel.newRandom().

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { WordleModel } from "./wordle";

const rl = createInterface({ input, output });

async function playOneGame(game: WordleModel): Promise<void> {
  console.log(`\nGuess the 5-letter word — you have ${WordleModel.MAX_TRIES} tries.\n`);

  // Keep asking for guesses until the game ends (a win or all tries used).
  while (!game.isGameOver) {
    const raw = await rl.question(
      `Turn ${game.currentTurn}/${WordleModel.MAX_TRIES} (${game.triesRemaining} left) — your guess: `,
    );
    const guess = raw.trim();

    if (guess.toLowerCase() === "quit") {
      // solution stays null until the game is actually over, so we can't
      // reveal it here by design — the answer is hidden while a game is live.
      console.log("\nGave up. (The answer stays hidden until a game ends.)");
      return;
    }

    // guessWord() is the single source of truth: true = accepted & scored
    // (one try used), false = rejected (not a real 5-letter word), no try spent.
    const accepted = game.guessWord(guess);
    if (!accepted) {
      console.log("  ✗ Not accepted — must be a real 5-letter word. Try again.\n");
      continue;
    }

    // formattedBoard is the whole board as text (letters over their colours).
    console.log("\n" + game.formattedBoard + "\n");

    // While the game is live, show the keyboard: letters grouped by status.
    if (!game.isGameOver) {
      console.log(game.formattedLetters + "\n");
    }
  }

  // The game is over — report the result and reveal the answer.
  if (game.isWon) {
    const tries = game.guessesMade;
    console.log(`You won in ${tries} ${tries === 1 ? "try" : "tries"}! 🎉`);
  } else if (game.isLost) {
    console.log(`Out of tries. The word was ${game.solution}.`);
  }
}

async function main(): Promise<void> {
  console.log("=== Wordle ===");

  // A fresh random game per round (the model is a pure function of its state,
  // so "play again" just constructs a new one).
  let game = WordleModel.newRandom();

  let keepPlaying = true;
  while (keepPlaying) {
    await playOneGame(game);

    const again = await rl.question("\nPlay again? (y/n): ");
    keepPlaying = again.trim().toLowerCase().startsWith("y");
    if (keepPlaying) game = WordleModel.newRandom();
  }

  console.log("Thanks for playing!");
  rl.close();
}

main();
