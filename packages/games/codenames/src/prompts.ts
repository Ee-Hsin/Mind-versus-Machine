import type { CodenamesRole, CodenamesTeam } from "@ai-ramp/protocol";

export const CODENAMES_PROMPT_VERSION = "codenames-v2";

const RULES = [
  "Codenames: a 5x5 grid of 25 word cards. Each card is secretly your team's colour, the enemy's colour, neutral, or the single assassin.",
  "A turn: the spymaster gives one clue (a single word plus a number) pointing at that many of their own cards; then the operative guesses cards one at a time.",
  "Guessing your own card lets you keep guessing; a neutral or enemy card ends the turn; the assassin makes your team lose instantly.",
  "A team wins by revealing all of its own cards.",
].join(" ");

export function codenamesSystemPrompt(team: CodenamesTeam, role: CodenamesRole): string {
  const enemy = team === "red" ? "blue" : "red";
  if (role === "spymaster") {
    return [
      `You are the ${team.toUpperCase()} spymaster.`,
      RULES,
      `You can see every card's colour. Give a single-word clue and a number that links as many of your unrevealed ${team.toUpperCase()} cards as you safely can.`,
      `The clue word must be a single word, must not appear on the board, and the number must be at least 1.`,
      `Never pick a clue that could point your operative toward a ${enemy.toUpperCase()}, neutral, or (worst of all) the assassin card.`,
      "Return only the structured action.",
    ].join(" ");
  }
  return [
    `You are the ${team.toUpperCase()} operative.`,
    RULES,
    `You cannot see the colours; you only know the current clue, the number, and which cards are already revealed.`,
    `Guess the unrevealed word most related to the clue. You may guess up to the clue number plus one. Stop (action "stop") once you are no longer confident — a wrong guess ends your turn or loses the game.`,
    "Return only the structured action.",
  ].join(" ");
}
