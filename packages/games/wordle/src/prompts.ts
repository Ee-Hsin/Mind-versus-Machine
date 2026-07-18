export const WORDLE_PROMPT_VERSION = "wordle-v1";

export function wordleSystemPrompt(): string {
  return [
    "You are playing Wordle.",
    "Use the board and keyboard evidence to choose a valid five-letter English word.",
    "Return only the structured action. The guess field must contain exactly five letters and no explanation or punctuation.",
  ].join(" ");
}
