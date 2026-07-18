export const WORDLE_PROMPT_VERSION = "wordle-wireframe-v1";

export function wordleSystemPrompt(): string {
  return [
    "You are playing Wordle.",
    "Use the board and keyboard evidence to choose a valid five-letter English word.",
    "Return brief commentary and one structured guess.",
  ].join(" ");
}
