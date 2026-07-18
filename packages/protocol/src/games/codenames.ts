import { z } from "zod";
import type { BaseGameMetrics, GameSpec } from "./types";

export const codenamesTeamSchema = z.enum(["red", "blue"]);
export const codenamesRoleSchema = z.enum(["spymaster", "operative"]);
export const codenamesSeatSchema = z.enum([
  "red-spymaster",
  "red-operative",
  "blue-spymaster",
  "blue-operative",
]);
export const codenamesConfigSchema = z.object({
  hostRole: codenamesRoleSchema.optional(),
});
export const codenamesActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("clue"), word: z.string().min(1), number: z.number().int().min(1) }),
  z.object({ type: z.literal("guess"), word: z.string().min(1) }),
  z.object({ type: z.literal("stop") }),
]);
export const codenamesDecisionSchema = z.object({
  reasoning: z.string(),
  move: codenamesActionSchema,
});

export type CodenamesTeam = z.infer<typeof codenamesTeamSchema>;
export type CodenamesRole = z.infer<typeof codenamesRoleSchema>;
export type CodenamesSeat = z.infer<typeof codenamesSeatSchema>;
export type CodenamesConfig = z.infer<typeof codenamesConfigSchema>;
export type CodenamesAction = z.infer<typeof codenamesActionSchema>;
export type CodenamesDecision = z.infer<typeof codenamesDecisionSchema>;
export type CodenamesCardColor = CodenamesTeam | "neutral" | "assassin";
export type CodenamesGuessOutcome = "correct" | "wrong-team" | "neutral" | "assassin";
export type CodenamesTurnEnd =
  | "limit"
  | "neutral"
  | "wrong-team"
  | "assassin"
  | "stopped"
  | "win"
  | null;

export interface CodenamesCardView {
  word: string;
  revealed: boolean;
  color: CodenamesCardColor | null;
}

export interface CodenamesClue {
  word: string;
  number: number;
}

export interface CodenamesGuessRecord {
  word: string;
  color: CodenamesCardColor;
  outcome: CodenamesGuessOutcome;
}

/** One team's turn: its clue, the (revealed) guesses made under it, and how it ended. */
export interface CodenamesTurnRecord {
  team: CodenamesTeam;
  clue: CodenamesClue;
  guesses: CodenamesGuessRecord[];
  endedBy: CodenamesTurnEnd;
}

export interface CodenamesPublicState {
  board: CodenamesCardView[];
  currentTeam: CodenamesTeam;
  phase: "clue" | "guess";
  activeSeat: CodenamesSeat;
  remaining: Record<CodenamesTeam, number>;
  currentClue: CodenamesClue | null;
  guessesRemaining: number;
  log: CodenamesTurnRecord[];
  isGameOver: boolean;
  winner: CodenamesTeam | null;
  endReason: "all-cards" | "assassin" | null;
  keyVisible: boolean;
}

export interface CodenamesMetrics extends BaseGameMetrics {
  team: CodenamesTeam;
  won: boolean;
  clues: number;
  guesses: number;
}

export interface CodenamesSpec extends GameSpec {
  config: CodenamesConfig;
  action: CodenamesAction;
  publicState: CodenamesPublicState;
  metrics: CodenamesMetrics;
}
