import { randomUUID } from "node:crypto";
import type { ModelPlayer } from "@ai-ramp/engine";
import { IMPOSTER_SEATS, type ArenaEvent, type RunConfig, type RunSummary } from "@ai-ramp/protocol";
import { codenamesModule } from "@ai-ramp/game-codenames";
import { imposterModule } from "@ai-ramp/game-imposter";
import { wordleModule } from "@ai-ramp/game-wordle";
import { AiSdkModelPlayer } from "@ai-ramp/model-runtime";
import { createSupabaseRepository, type SupabaseArenaRepository } from "@ai-ramp/storage";
import type { z } from "zod";

const repository = createSupabaseRepository();
const workerId = process.env.WORKER_ID ?? `worker-${randomUUID()}`;
const pollMs = Number(process.env.WORKER_POLL_MS ?? "1000");
const concurrency = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? "6"));

class HumanPlayer implements ModelPlayer {
  private turnNumber = 0;
  constructor(readonly id: string, private runId: string, private repository: SupabaseArenaRepository) {}
  async act<Action>(_system: string, _prompt: string, schema: z.ZodType<Action>, options?: { signal?: AbortSignal }) {
    const turn = await this.repository.createHumanTurn({ runId: this.runId, gameId: this.id,
      turnNumber: ++this.turnNumber, seatId: this.id });
    const startedAt = Date.now();
    while (!options?.signal?.aborted) {
      const current = await this.repository.loadHumanTurn(turn.id);
      if (current?.status === "submitted") {
        const parsed = schema.safeParse(current.action);
        if (!parsed.success) throw new Error("Submitted human action does not match the game schema.");
        await this.repository.consumeHumanTurn(turn.id);
        return { action: parsed.data, latencyMs: Date.now() - startedAt, inputTokens: 0, outputTokens: 0 };
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw options?.signal?.reason ?? new Error("Run cancelled.");
  }
}

async function execute(run: RunSummary, signal: AbortSignal) {
  let sequence = 0;
  const events = {
    async publish(event: ArenaEvent) {
      await repository.appendEvent({ ...event, sequence: ++sequence });
    },
  };
  const player = (id: string) => new AiSdkModelPlayer(id);
  const models = run.config.models;
  const contextBase = { runId: run.id, matchNumber: 1, events, signal };
  if (run.config.gameType === "wordle") {
    const players: Record<string, ModelPlayer> = Object.fromEntries(models.map((model) => [model.id, player(model.id)]));
    if (run.config.mode === "play") players["human-wordle"] = new HumanPlayer("human-wordle", run.id, repository);
    return wordleModule.definition.runMatch({ ...contextBase, config: run.config as RunConfig<"wordle">, players });
  }
  if (run.config.gameType === "imposter") {
    const play = run.config.mode === "play";
    const expectedModels = play ? 5 : 6;
    if (models.length !== expectedModels) {
      throw new Error(`Imposter ${run.config.mode} mode requires exactly ${expectedModels} models.`);
    }
    const modelSeats = play ? IMPOSTER_SEATS.slice(1) : IMPOSTER_SEATS;
    const players: Record<string, ModelPlayer> = Object.fromEntries(
      modelSeats.map((seat, index) => [seat, player(models[index].id)]),
    );
    if (play) players.P1 = new HumanPlayer("P1", run.id, repository);
    return imposterModule.definition.runMatch({
      ...contextBase,
      config: run.config as RunConfig<"imposter">,
      players,
    });
  }
  if (models.length !== 2) throw new Error("Codenames requires exactly two models.");
  const red = player(models[0].id);
  const blue = player(models[1].id);
  const play = run.config.mode === "play";
  return codenamesModule.definition.runMatch({
    ...contextBase, config: run.config as RunConfig<"codenames">,
    players: play ? {
      "red-spymaster": new HumanPlayer("red-spymaster", run.id, repository),
      "red-operative": new HumanPlayer("red-operative", run.id, repository),
      "blue-spymaster": red, "blue-operative": blue,
    } : { "red-spymaster": red, "red-operative": red, "blue-spymaster": blue, "blue-operative": blue },
  });
}

async function processRun(run: RunSummary) {
  try {
    const controller = new AbortController();
    const monitor = setInterval(async () => {
      try {
        await repository.heartbeat(run.id, workerId);
        if (await repository.isCancellationRequested(run.id)) controller.abort(new Error("Run cancelled."));
      } catch (error) { console.error(`Run ${run.id} monitor failed:`, error); }
    }, 2_000);
    try {
      const result = await execute(run, controller.signal);
      if (controller.signal.aborted) await repository.cancelRun(run.id);
      else await repository.finishRun(run.id, result);
    } finally { clearInterval(monitor); }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Run ${run.id} failed:`, error);
    try {
      if (await repository.isCancellationRequested(run.id)) await repository.cancelRun(run.id);
      else await repository.failRun(run.id, message);
    } catch (reportError) {
      console.error(`Could not persist failure for run ${run.id}:`, reportError);
    }
  }
}

const configuredModelCount = (process.env.ARENA_MODELS ?? "").split(",").filter((id) => id.trim()).length;
console.log(`Worker ${workerId} started with ${concurrency} run slots and ${configuredModelCount} configured models.`);
const activeRuns = new Set<Promise<void>>();
while (true) {
  if (activeRuns.size >= concurrency) {
    await Promise.race(activeRuns);
    continue;
  }
  let run: RunSummary | null;
  try {
    run = await repository.claimNextImposterRun(workerId);
    if (!run) run = await repository.claimNextRun(workerId);
  } catch (error) {
    console.error("Worker queue poll failed; retrying:", error);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    continue;
  }
  if (!run) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    continue;
  }
  let task: Promise<void>;
  task = processRun(run).finally(() => activeRuns.delete(task));
  activeRuns.add(task);
}
