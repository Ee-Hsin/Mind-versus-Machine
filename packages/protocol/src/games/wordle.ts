import { z } from "zod";
import type { ActorKind, GameStatus } from "../shared";
import type { BaseGameMetrics, GameSpec } from "./types";

export const WORDLE_HUMAN_SEAT = "human";
export const WORDLE_MAX_TRIES = 6;
export const WORDLE_WORD_LENGTH = 5;

/**
 * The answer is game configuration, not per-seat state: every board in a game
 * scores against the same word, and it is chosen and persisted before anyone
 * plays. Server-side only — it must never appear in a live client response.
 */
export const wordleConfigSchema = z.object({
  answer: z.string().length(WORDLE_WORD_LENGTH),
});
export const wordleActionSchema = z.object({
  reasoning: z.string().optional().describe("Optional brief reasoning; never append this to the guess field"),
  guess: z.string()
    .describe("Start with exactly one five-letter word; put any explanation in reasoning instead"),
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

// --- HTTP contracts ---------------------------------------------------------

export const createWordleGameRequestSchema = z.object({
  modelIds: z.array(z.string().min(1)).min(1).max(5),
  displayName: z.string().trim().min(1).max(40),
});

/**
 * `expectedTurn` is optimistic concurrency, not decoration: it is the attempt
 * number the client believes it is playing. A double-submitted guess (or one
 * that raced a resume) carries a stale value and is rejected with the current
 * board rather than silently burning a try.
 */
export const submitWordleGuessRequestSchema = z.object({
  guess: z.string().trim().regex(/^[A-Za-z]{5}$/, "Guess must be five letters"),
  expectedTurn: z.number().int().min(1).max(WORDLE_MAX_TRIES),
});

/**
 * Words the client rejected locally against the allowed-guess list. Recorded so
 * human and model `invalidWordRate` measure the same thing — without it, humans
 * would score a perfect validity rate purely because their bad guesses never
 * reach the server.
 */
export const reportWordleRejectionRequestSchema = z.object({
  guess: z.string().trim().min(1).max(24),
});

export type CreateWordleGameRequest = z.infer<typeof createWordleGameRequestSchema>;
export type SubmitWordleGuessRequest = z.infer<typeof submitWordleGuessRequestSchema>;
export type ReportWordleRejectionRequest = z.infer<typeof reportWordleRejectionRequestSchema>;

/**
 * One player's board as a client may see it. While a game is live, model rows
 * carry their colours but blank `guess` strings — the shape a spectator is
 * allowed to know. `concealed` says which it is.
 */
export interface WordleSeatView {
  seatId: string;
  actorKind: ActorKind;
  modelId?: string;
  displayName: string;
  board: WordleGuessRow[];
  guessesMade: number;
  triesRemaining: number;
  isWon: boolean;
  isGameOver: boolean;
  concealed: boolean;
}

export interface WordleSnapshot {
  gameId: string;
  status: GameStatus;
  expiresAt: string;
  /** True once the human's board is over and model letters are unsealed. */
  revealed: boolean;
  /** Present only when `revealed` — never sent while the human can still play. */
  answer?: string;
  you: WordleSeatView;
  models: WordleSeatView[];
}

export interface WordleGuessResult {
  accepted: boolean;
  /** Why a guess was refused (stale turn, not a word, board already over). */
  reason?: string;
  you: WordleSeatView;
  revealed: boolean;
  answer?: string;
}

/**
 * Payload of the `turn` event a Wordle match emits per model attempt. It carries
 * the canonical guess, so it is never handed to a client directly — the live
 * layer projects it into a `WordleSeatView`, blanking letters while the human's
 * board is still in play.
 */
export interface WordleTurnEventPayload {
  seatId: string;
  guess: string;
  states: WordleLetterState[];
  accepted: boolean;
  attempt: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  guessesMade: number;
  triesRemaining: number;
  isWon: boolean;
  isGameOver: boolean;
}

/**
 * Server-pushed updates. The human's own scoring comes back on the guess
 * response instead — it is a direct request/response and needs no correlation.
 *
 * The sequence number is split out so a publisher can emit a body and let the
 * stream assign the number. (`Omit<Union, "seq">` would collapse the union into
 * its common keys, which is why this is two types rather than one.)
 */
export type WordleStreamEventBody =
  | { type: "seat"; seat: WordleSeatView }
  | { type: "revealed"; answer: string; models: WordleSeatView[] }
  | { type: "finished"; status: GameStatus };

export type WordleStreamEvent = WordleStreamEventBody & { seq: number };
