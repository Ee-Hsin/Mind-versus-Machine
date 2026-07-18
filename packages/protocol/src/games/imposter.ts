import { z } from "zod";
import type { BaseGameMetrics, GameSpec } from "./types";

export const imposterSeatSchema = z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]);
export const imposterAlignmentSchema = z.enum(["crew", "imposter"]);
export const imposterConfigSchema = z.object({});

export const imposterActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("clue"), word: z.string().min(1) }),
  z.object({ type: z.literal("vote"), target: imposterSeatSchema }),
  z.object({ type: z.literal("defend"), message: z.string().min(1), pointAt: imposterSeatSchema.optional() }),
  z.object({ type: z.literal("guess"), word: z.string().min(1) }),
]);

export const imposterDecisionSchema = z.object({
  reasoning: z.string(),
  move: imposterActionSchema,
});

/** The six seats, in order. */
export const IMPOSTER_SEATS = imposterSeatSchema.options;

export type ImposterSeat = z.infer<typeof imposterSeatSchema>;
export type ImposterAlignment = z.infer<typeof imposterAlignmentSchema>;
export type ImposterConfig = z.infer<typeof imposterConfigSchema>;
export type ImposterAction = z.infer<typeof imposterActionSchema>;
export type ImposterDecision = z.infer<typeof imposterDecisionSchema>;

export type ImposterPhase =
  | "clue"
  | "accuse"
  | "accuse-tiebreak"
  | "defense"
  | "rebuttal"
  | "final"
  | "final-tiebreak"
  | "steal"
  | "gameover";

export type ImposterEndReason = "crew-voted-out" | "imposter-voted-out" | "word-stolen";

export interface ImposterClueView {
  seat: ImposterSeat;
  word: string;
}

export interface ImposterPublicState {
  phase: ImposterPhase;
  seats: ImposterSeat[];
  speakingOrder: ImposterSeat[];
  currentSpeaker: ImposterSeat | null;
  clues: ImposterClueView[];
  accused: ImposterSeat | null;
  pointedAt: ImposterSeat | null;
  eliminated: ImposterSeat | null;
  isGameOver: boolean;
  winner: ImposterAlignment | null;
  endReason: ImposterEndReason | null;
  /** The seat this projection was built for (null for a spectator). */
  viewer: ImposterSeat | null;
  /** The viewer's own alignment — role-safe: null unless it's their own seat or the game is over. */
  viewerRole: ImposterAlignment | null;
  /** The secret word — visible to crew (or everyone once the game is over), else null. */
  word: string | null;
  /** The imposter's hint — visible to the imposter (or everyone once the game is over), else null. */
  hint: string | null;
}

export interface ImposterMetrics extends BaseGameMetrics {
  role: ImposterAlignment;
  won: boolean;
}

export interface ImposterSpec extends GameSpec {
  config: ImposterConfig;
  action: ImposterAction;
  publicState: ImposterPublicState;
  metrics: ImposterMetrics;
}
