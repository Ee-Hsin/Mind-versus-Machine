import { z } from "zod";

/**
 * Enums shared by the run-agnostic core and the per-game DTOs. They live in
 * their own module so `core.ts` and `games/*.ts` can both import them without
 * importing each other.
 */

export const gameStatusSchema = z.enum(["in_progress", "completed", "forfeited", "failed"]);

/**
 * How a participant's own board ended. Distinct from the game's status: a human
 * may be `forfeited` while every model in the same game is `won`/`lost`, which
 * is exactly what makes those model results still countable.
 *
 * `forfeited` is an explicit quit; `abandoned` is the 24h expiry sweep. Both are
 * excluded from human leaderboard stats, but keeping them apart tells you
 * whether people are quitting or just walking away.
 */
export const participantOutcomeSchema = z.enum(["won", "lost", "forfeited", "abandoned"]);

export const actorKindSchema = z.enum(["human", "model"]);

export type GameStatus = z.infer<typeof gameStatusSchema>;
export type ParticipantOutcome = z.infer<typeof participantOutcomeSchema>;
export type ActorKind = z.infer<typeof actorKindSchema>;

/** Statuses in which no further play is possible. */
export const TERMINAL_GAME_STATUSES: readonly GameStatus[] = ["completed", "forfeited", "failed"];

export function isTerminalStatus(status: GameStatus): boolean {
  return TERMINAL_GAME_STATUSES.includes(status);
}
