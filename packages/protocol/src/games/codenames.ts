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

export interface CodenamesCardView {
  word: string;
  revealed: boolean;
  color: CodenamesCardColor | null;
}

export interface CodenamesPublicState {
  board: CodenamesCardView[];
  currentTeam: CodenamesTeam;
  phase: "clue" | "guess";
  activeSeat: CodenamesSeat;
  remaining: Record<CodenamesTeam, number>;
  isGameOver: boolean;
  winner: CodenamesTeam | null;
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
