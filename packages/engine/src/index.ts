import type { z } from "zod";
import type {
  ArenaEvent,
  GameAction,
  GameConfig,
  GameManifest,
  GameMetrics,
  GamePublicState,
  GameType,
  HumanRef,
  PendingTurn,
  RunConfig,
  RunSummary,
} from "@ai-ramp/protocol";

export class NotImplementedError extends Error {
  constructor(capability: string) {
    super(`${capability} is part of the architecture wireframe and has not been implemented yet.`);
    this.name = "NotImplementedError";
  }
}

export interface ActionResult {
  accepted: boolean;
  message?: string;
}

export interface GameResult {
  scores: Record<string, number>;
  summary: string;
}

export interface GameAdapter<G extends GameType> {
  readonly gameType: G;
  readonly actionSchema: z.ZodType<GameAction<G>>;
  playersToAct(): string[];
  systemPromptFor(playerId: string): string;
  viewFor(playerId: string): string;
  applyAction(playerId: string, action: GameAction<G>): ActionResult;
  isOver(): boolean;
  result(): GameResult;
  publicStateFor(viewerId?: string | "spectator"): GamePublicState<G>;
  serialize(): unknown;
}

export interface MatchContext<G extends GameType> {
  runId: string;
  matchNumber: number;
  config: RunConfig<G>;
  events: ArenaEventSink;
  interactive?: InteractiveController;
  signal?: AbortSignal;
}

export interface GameDefinition<G extends GameType> {
  readonly gameType: G;
  runMatch(context: MatchContext<G>): Promise<{ metrics: GameMetrics<G>[] }>;
}

export interface GameModule<G extends GameType> {
  manifest: GameManifest<G>;
  configSchema: z.ZodType<GameConfig<G>>;
  actionSchema: z.ZodType<GameAction<G>>;
  definition: GameDefinition<G>;
}

export interface ModelActOutcome<Action> {
  action: Action;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ModelPlayer {
  readonly id: string;
  act<Action>(
    system: string,
    prompt: string,
    schema: z.ZodType<Action>,
    options?: { signal?: AbortSignal; onCommentaryDelta?: (delta: string) => void | Promise<void> },
  ): Promise<ModelActOutcome<Action>>;
}

export interface HumanActionRequest<Action> extends PendingTurn {
  runId: string;
  matchId: string;
  schema: z.ZodType<Action>;
  signal?: AbortSignal;
}

export interface InteractiveController {
  waitUntilReady(runId: string, signal?: AbortSignal): Promise<HumanRef[]>;
  waitForAction<Action>(request: HumanActionRequest<Action>): Promise<Action>;
}

export interface ArenaEventSink {
  publish(event: ArenaEvent): Promise<void>;
}

export interface ArenaRepository {
  appendEvent(event: ArenaEvent): Promise<void>;
  getRun(runId: string): Promise<RunSummary | null>;
  listRuns(limit?: number): Promise<RunSummary[]>;
  claimNextRun(workerId: string): Promise<RunSummary | null>;
  requestCancellation(runId: string): Promise<void>;
}
