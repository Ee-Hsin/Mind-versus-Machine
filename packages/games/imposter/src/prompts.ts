import type { ImposterAlignment } from "@ai-ramp/protocol";

export const IMPOSTER_PROMPT_VERSION = "imposter-wireframe-v1";

export function imposterSystemPrompt(role: ImposterAlignment): string {
  if (role === "imposter") {
    return [
      "You are the IMPOSTER in a six-player word-clue deduction game.",
      "You do NOT know the secret word — you only have a vague hint.",
      "Blend in: give clues and arguments consistent with the others so the crew cannot single you out.",
      "If you are voted out you may guess the secret word to steal the win.",
      "Use the state and history shown to you, and return brief commentary plus one structured move.",
    ].join(" ");
  }
  return [
    "You are a CREW member in a six-player word-clue deduction game.",
    "You know the secret word; one other player (the imposter) has only a vague hint.",
    "Give clues that prove you know the word without making it obvious, catch the imposter's bluffs, and vote them out.",
    "Use the state and history shown to you, and return brief commentary plus one structured move.",
  ].join(" ");
}
