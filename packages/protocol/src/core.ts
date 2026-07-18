import { z } from "zod";
import { codenamesRoleSchema } from "./games/codenames";
import type { GameConfig, GameType } from "./games";

export const RUNNER_VERSION = "wireframe-v1" as const;
export const runModeSchema = z.enum(["play", "benchmark"]);
export const runStatusSchema = z.enum(["lobby", "queued", "running", "completed", "failed", "cancelled"]);

export const modelRefSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
});

export const createPlayRunRequestSchema = z.discriminatedUnion("gameType", [
  z.object({
    gameType: z.literal("wordle"),
    modelIds: z.array(z.string().min(1)).min(1).max(5),
    displayName: z.string().trim().min(1).max(40),
  }),
  z.object({
    gameType: z.literal("codenames"),
    modelIds: z.tuple([z.string().min(1), z.string().min(1)]),
    displayName: z.string().trim().min(1).max(40),
    hostRole: codenamesRoleSchema,
  }),
]);

export const joinRoomRequestSchema = z.object({
  roomCode: z.string().trim().min(4).max(12),
  displayName: z.string().trim().min(1).max(40),
});

export const submitActionRequestSchema = z.object({
  turnId: z.string().uuid(),
  action: z.unknown(),
  idempotencyKey: z.string().min(1).max(100),
});

export type RunMode = z.infer<typeof runModeSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type ModelRef = z.infer<typeof modelRefSchema>;
export type CreatePlayRunRequest = z.infer<typeof createPlayRunRequestSchema>;
export type JoinRoomRequest = z.infer<typeof joinRoomRequestSchema>;
export type SubmitActionRequest = z.infer<typeof submitActionRequestSchema>;

export interface HumanRef {
  id: string;
  displayName: string;
  seatId: string;
}

export interface RunConfig<G extends GameType = GameType> {
  gameType: G;
  mode: RunMode;
  gameConfig: GameConfig<G>;
  models: ModelRef[];
  matches: number;
  concurrency: number;
}

export interface ArenaActor {
  id: string;
  displayName: string;
  kind: "model" | "human";
  modelId?: string;
  seatId?: string;
}

export type ArenaEventAudience =
  | { kind: "public" }
  | { kind: "seat"; seatId: string }
  | { kind: "postgame" }
  | { kind: "operator" };

export interface ArenaEvent<G extends GameType = GameType> {
  sequence: number;
  runId: string;
  gameType: G;
  type: string;
  timestamp: string;
  audience: ArenaEventAudience;
  matchId?: string;
  gameId?: string;
  payload: unknown;
}

export interface GameManifest<G extends GameType = GameType> {
  id: G;
  label: string;
  description: string;
  modes: RunMode[];
  modelCount: { min: number; max: number };
  humanSeats: string[];
  engineVersion: string;
  promptVersion: string;
}

export interface ViewerSession {
  participantId: string;
  displayName: string;
  seatId: string;
  ready: boolean;
  isHost: boolean;
}

export interface RoomState {
  code?: string;
  participants: ViewerSession[];
  ready: boolean;
}

export interface PendingTurn {
  turnId: string;
  gameId: string;
  turnNumber: number;
  seatId: string;
}

export interface RunSummary<G extends GameType = GameType> {
  id: string;
  status: RunStatus;
  config: RunConfig<G>;
  createdAt: string;
  updatedAt: string;
}

export type EventVisibility = "live" | "revealed" | "terminal";

export interface RunSnapshot<G extends GameType = GameType> {
  run: RunSummary<G>;
  events: ArenaEvent<G>[];
  viewer: ViewerSession | null;
  room: RoomState | null;
  pendingTurn: PendingTurn | null;
  visibility: EventVisibility;
}

export interface RunEventPage<G extends GameType = GameType> {
  events: ArenaEvent<G>[];
  cursor: number;
  visibility: EventVisibility;
  reset: boolean;
}
