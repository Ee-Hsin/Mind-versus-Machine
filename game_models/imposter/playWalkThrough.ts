// Example: a scripted walkthrough of an Imposter game using the Imposter class.
//
// Run it with:
//   npx tsx playWalkThrough.ts
//
// The Imposter game has hidden info (Crew know the word, the Imposter only a
// hint) and is multi-player, so a single interactive terminal would spoil it.
// This drives a full seeded game programmatically and prints what each role
// sees, the clue round, the accusation/defense/rebuttal drama, the final vote,
// and the steal attempt. It doubles as a usage reference — every call goes
// through the public API. For an interactive game you drive yourself, see play.ts.

import { Imposter, type Seat } from "./imposter";

// Fixed setup so the walkthrough is reproducible: P5 is the imposter; the secret
// word is OCEAN; the imposter's hint is "very big"; speaking order below.
const ORDER: Seat[] = ["P3", "P6", "P1", "P4", "P2", "P5"];
const game = new Imposter({ imposter: "P5", word: "OCEAN", hint: "very big", speakingOrder: ORDER });

function section(title: string): void {
  console.log("\n" + "=".repeat(60) + "\n" + title + "\n" + "=".repeat(60));
}

// --- What each role sees at the start ------------------------------------
section("Roles: what a Crew member vs the Imposter sees");
console.log("\n--- P1's view (Crew) ---\n" + game.formattedState("P1"));
console.log("\n--- P5's view (Imposter) ---\n" + game.formattedState("P5"));

// --- Clue round: 2 laps in speaking order --------------------------------
section("Clue round (2 laps, order " + ORDER.join(" → ") + ")");
// Crew give clues about OCEAN; the Imposter (P5) bluffs off the hint "very big".
const clues: Record<Seat, [string, string]> = {
  P1: ["DEEP", "SHORE"],
  P2: ["SALT", "BLUE"],
  P3: ["WAVE", "TIDE"],
  P4: ["FISH", "REEF"],
  P6: ["BOAT", "CORAL"],
  P5: ["HUGE", "VAST"], // imposter bluffing
};
const played: Record<Seat, number> = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0, P6: 0 };
while (game.currentPhase === "clue") {
  const seat = game.currentSpeaker!;
  const word = clues[seat][played[seat]++];
  game.clue(seat, word);
  console.log(`  ${seat} clues: ${word}${seat === "P5" ? "   (imposter, bluffing)" : ""}`);
}

// --- Accusation vote -----------------------------------------------------
section("Accusation vote");
// The Crew find P5's clues vague and suspect the imposter; P5 deflects onto P1.
game.vote("P1", "P5");
game.vote("P2", "P5");
game.vote("P3", "P5");
game.vote("P4", "P1");
game.vote("P6", "P5");
game.vote("P5", "P1");
console.log(`  Accused: ${game.accusedSeat}`);

// --- Defense + rebuttal --------------------------------------------------
section("Defense & rebuttal");
game.defend("P5", "Big is fair — think whales and vast open water!", "P1");
console.log(`  ${game.accusedSeat} defends and points at P1.`);
game.defend("P1", "My clues were concrete — DEEP and SHORE. That's not a bluff.");
console.log("  P1 rebuts.");

// --- Final vote ----------------------------------------------------------
section("Final vote");
game.vote("P1", "P5");
game.vote("P2", "P5");
game.vote("P3", "P5");
game.vote("P4", "P5");
game.vote("P6", "P5");
game.vote("P5", "P1");
console.log(`  Eliminated: ${game.eliminatedSeat}  →  ${game.currentPhase === "steal" ? "the Imposter was caught!" : "a Crew member!"}`);

// --- Steal attempt -------------------------------------------------------
section("Steal attempt (caught Imposter guesses the word)");
game.guessWord("RIVER"); // wrong guess → Crew win
console.log(`  Imposter guessed "RIVER".`);

// --- Result + full log ---------------------------------------------------
section("Result");
console.log(`\n${game.winner!.toUpperCase()} wins — ${game.endReason}. The word was OCEAN; the imposter was P5.\n`);
console.log("Full attributed log:\n");
console.log(game.formattedLog);

// --- How you'd wire this to a runner/DB ----------------------------------
section("Persisting / serving state");
console.log(`
The model is the board + rules + attributed log — a runner/adapter wraps it:
  • full snapshot for the DB / replay:        game.getState()            (has the word + roles)
  • role-safe view to push to each player:    game.getPlayerState("P1")  // crew: word, not the imposter
                                               game.getPlayerState("P5")  // imposter: hint, not the word
  • rebuild a stored game (or scrub replay):  Imposter.fromState(row)
`);
