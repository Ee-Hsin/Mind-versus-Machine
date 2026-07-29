import type { z } from "zod";
import type {
  ArenaEvent,
  GameAction,
  GameConfig,
  GameManifest,
  GameMetrics,
  GamePublicState,
  GameType,
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
  gameId: string;
  config: GameConfig<G>;
  /**
   * Seats played by a person rather than a model. Games use this to decide what
   * to reveal and to whom; the engine itself stays rules-agnostic.
   */
  humanSeats: string[];
  events: ArenaEventSink;
  players: Record<string, ModelPlayer>;
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

export interface ArenaEventSink {
  publish(event: ArenaEvent): Promise<void>;
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
        let outcome: ModelActOutcome<GameAction<G>>;
        try {
          outcome = await player.act(
            adapter.systemPromptFor(playerId), prompt, adapter.actionSchema,
            { signal: options.signal },
          );
        } catch (error) {
          if (options.signal?.aborted) throw error; // let cancellation propagate
          // The model call threw (e.g. the model-runtime's structured-output
          // retries were exhausted / NoObjectGeneratedError). Treat it like an
          // invalid action: log it, re-prompt on the next attempt with the reason
          // appended, and abandon after maxAttempts rather than crashing the match.
          const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
          const failedTurn: TurnTelemetry = {
            turnNumber, playerId, player: player.id, prompt,
            rawOutput: null, action: null, accepted: false, attempt,
            latencyMs: 0, inputTokens: 0, outputTokens: 0,
          };
          turns.push(failedTurn);
          await options.observer?.onTurn?.(failedTurn);
          rejection = `Model did not return a valid structured action (${message}).`;
          if (attempt === maxAttempts) {
            abandoned = true;
            break outer;
          }
          continue;
        }
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
