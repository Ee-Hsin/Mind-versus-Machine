import type { CodenamesRole, CodenamesTeam } from "@ai-ramp/protocol";

export const CODENAMES_PROMPT_VERSION = "codenames-wireframe-v1";

export function codenamesSystemPrompt(team: CodenamesTeam, role: CodenamesRole): string {
  if (role === "spymaster") {
    return `You are the ${team} spymaster. Use the hidden key to return one legal clue and number with brief commentary.`;
  }
  return `You are the ${team} operative. Use only the visible board, clue, and history to guess or stop with brief commentary.`;
}
