import { z } from "zod";
import type { ActorKind, GameStatus, ParticipantOutcome } from "./shared";
import type { GameConfig, GameType } from "./games";

export const RUNNER_VERSION = "runner-v1" as const;

export const modelRefSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
});

export type ModelRef = z.infer<typeof modelRefSchema>;

export interface GameManifest<G extends GameType = GameType> {
  id: G;
  label: string;
  description: string;
  modelCount: { min: number; max: number };
  humanSeats: string[];
  engineVersion: string;
  promptVersion: string;
}

/**
 * Who may see an event. `seat` is the per-seat security boundary (a Codenames
 * spymaster's key); `postgame` unseals once that game's reveal condition is met;
 * `operator` never reaches a client.
 */
export type ArenaEventAudience =
  | { kind: "public" }
  | { kind: "seat"; seatId: string }
  | { kind: "postgame" }
  | { kind: "operator" };

/**
 * A single transition emitted by a game definition. The sink decides what to do
 * with it — fan out to live subscribers, persist it, or both. Sequence numbers
 * are assigned by the sink, not the definition, so definitions stay stateless.
 */
export interface ArenaEvent<G extends GameType = GameType> {
  gameId: string;
  gameType: G;
  type: string;
  seatId?: string;
  timestamp: string;
  audience: ArenaEventAudience;
  payload: unknown;
}

/** Configuration a game is created with. One game is one match. */
export interface GameConfiguration<G extends GameType = GameType> {
  gameType: G;
  gameConfig: GameConfig<G>;
  models: ModelRef[];
}

export interface GameParticipant {
  seatId: string;
  actorKind: ActorKind;
  /** Set when `actorKind` is `model`, e.g. `anthropic:claude-haiku-4-5`. */
  modelId?: string;
  displayName: string;
  /** `undefined` while the board is still in play. */
  outcome?: ParticipantOutcome;
}

export interface GameSummary<G extends GameType = GameType> {
  id: string;
  gameType: G;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
  /** When an unfinished game is swept and auto-forfeited. */
  expiresAt: string;
  completedAt?: string;
}

export * from "./shared";
