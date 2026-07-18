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
  players: Record<string, ModelPlayer>;
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
  createRun(config: RunConfig, status?: "queued" | "running" | "lobby"): Promise<RunSummary>;
  appendEvent(event: ArenaEvent): Promise<void>;
  listEvents(runId: string, after?: number, limit?: number): Promise<ArenaEvent[]>;
  getRun(runId: string): Promise<RunSummary | null>;
  listRuns(limit?: number): Promise<RunSummary[]>;
  claimNextRun(workerId: string): Promise<RunSummary | null>;
  queueRun(runId: string): Promise<void>;
  requestCancellation(runId: string): Promise<void>;
  isCancellationRequested(runId: string): Promise<boolean>;
  heartbeat(runId: string, workerId: string): Promise<void>;
  cancelRun(runId: string): Promise<void>;
  finishRun(runId: string, result: unknown): Promise<void>;
  failRun(runId: string, error: string): Promise<void>;
}

export interface TurnTelemetry {
  turnNumber: number;
  playerId: string;
  player: string;
  prompt: string;
  rawOutput: unknown;
  action: unknown;
  accepted: boolean;
  attempt: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

export interface GameObserver {
  onTurn?(turn: TurnTelemetry): Promise<void>;
}

export interface AdapterRunResult {
  abandoned: boolean;
  result: GameResult;
  finalState: unknown;
  turns: TurnTelemetry[];
  inputTokens: number;
  outputTokens: number;
}

/** Execute any adapter without knowing its game's rules. */
export async function runAdapter<G extends GameType>(
  adapter: GameAdapter<G>,
  players: Record<string, ModelPlayer>,
  options: { maxAttemptsPerTurn?: number; observer?: GameObserver; signal?: AbortSignal } = {},
): Promise<AdapterRunResult> {
  const maxAttempts = options.maxAttemptsPerTurn ?? 3;
  const turns: TurnTelemetry[] = [];
  let turnNumber = 0;
  let abandoned = false;
  let inputTokens = 0;
  let outputTokens = 0;

  outer: while (!adapter.isOver()) {
    if (options.signal?.aborted) throw options.signal.reason ?? new Error("Run cancelled.");
    for (const playerId of adapter.playersToAct()) {
      const player = players[playerId];
      if (!player) throw new Error(`No player registered for seat ${playerId}.`);
      turnNumber++;
      let rejection: string | undefined;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const prompt = adapter.viewFor(playerId) +
          (rejection ? `\n\nYour previous action was invalid: ${rejection}` : "");
        const outcome = await player.act(
          adapter.systemPromptFor(playerId), prompt, adapter.actionSchema,
          { signal: options.signal },
        );
        const parsed = adapter.actionSchema.safeParse(outcome.action);
        const applied = parsed.success
          ? adapter.applyAction(playerId, parsed.data)
          : { accepted: false, message: "Output did not match the action schema." };
        const turn: TurnTelemetry = {
          turnNumber, playerId, player: player.id, prompt,
          rawOutput: outcome.action, action: parsed.success ? parsed.data : null,
          accepted: applied.accepted, attempt, latencyMs: outcome.latencyMs,
          inputTokens: outcome.inputTokens ?? 0, outputTokens: outcome.outputTokens ?? 0,
        };
        inputTokens += turn.inputTokens;
        outputTokens += turn.outputTokens;
        turns.push(turn);
        await options.observer?.onTurn?.(turn);
        if (applied.accepted) break;
        rejection = applied.message ?? "Invalid action.";
        if (attempt === maxAttempts) {
          abandoned = true;
          break outer;
        }
      }
    }
  }
  return {
    abandoned,
    result: abandoned ? { scores: {}, summary: `Abandoned after ${maxAttempts} invalid attempts.` } : adapter.result(),
    finalState: adapter.serialize(), turns, inputTokens, outputTokens,
  };
}

export async function runPool<T>(tasks: (() => Promise<T>)[], concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Concurrency must be a positive integer.");
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      try { results[index] = { status: "fulfilled", value: await tasks[index]() }; }
      catch (reason) { results[index] = { status: "rejected", reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

export const INITIAL_ELO = 1200;
export function updateElo(ratingA: number, ratingB: number, scoreA: number) {
  const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  const delta = 32 * (scoreA - expectedA);
  return { ratingA: ratingA + delta, ratingB: ratingB - delta };
}
