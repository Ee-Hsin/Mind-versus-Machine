import { z } from "zod";
import type { BaseGameMetrics, GameSpec } from "./types";

export const wordleConfigSchema = z.object({});
export const wordleActionSchema = z.object({
  guess: z.string().regex(/^[A-Za-z]{5}$/)
    .describe("Exactly one five-letter word containing letters only; put no reasoning or punctuation in this field"),
});
export const wordleDecisionSchema = z.object({
  reasoning: z.string(),
  move: wordleActionSchema,
});

export type WordleConfig = z.infer<typeof wordleConfigSchema>;
export type WordleAction = z.infer<typeof wordleActionSchema>;
export type WordleDecision = z.infer<typeof wordleDecisionSchema>;
export type WordleLetterState = "green" | "yellow" | "gray";

export interface WordleGuessRow {
  guess: string;
  states: WordleLetterState[];
}

export interface WordlePublicState {
  board: WordleGuessRow[];
  guessesMade: number;
  triesRemaining: number;
  isWon: boolean;
  isGameOver: boolean;
  answer?: string;
}

export interface WordleMetrics extends BaseGameMetrics {
  won: boolean;
  guesses: number;
}

export interface WordleSpec extends GameSpec {
  config: WordleConfig;
  action: WordleAction;
  publicState: WordlePublicState;
  metrics: WordleMetrics;
}
