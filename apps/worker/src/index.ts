import { randomUUID } from "node:crypto";
import type { ArenaEvent, RunConfig, RunSummary } from "@ai-ramp/protocol";
import { codenamesModule } from "@ai-ramp/game-codenames";
import { wordleModule } from "@ai-ramp/game-wordle";
import { AiSdkModelPlayer } from "@ai-ramp/model-runtime";
import { createSupabaseRepository } from "@ai-ramp/storage";

const repository = createSupabaseRepository();
const workerId = process.env.WORKER_ID ?? `worker-${randomUUID()}`;
const pollMs = Number(process.env.WORKER_POLL_MS ?? "1000");

async function execute(run: RunSummary) {
  let sequence = 0;
  const events = {
    async publish(event: ArenaEvent) {
      await repository.appendEvent({ ...event, sequence: ++sequence });
    },
  };
  const player = (id: string) => new AiSdkModelPlayer(id);
  const models = run.config.models;
  const contextBase = { runId: run.id, matchNumber: 1, events };
  if (run.config.gameType === "wordle") {
    const players = Object.fromEntries(models.map((model) => [model.id, player(model.id)]));
    return wordleModule.definition.runMatch({ ...contextBase, config: run.config as RunConfig<"wordle">, players });
  }
  if (models.length !== 2) throw new Error("Codenames requires exactly two models.");
  const red = player(models[0].id);
  const blue = player(models[1].id);
  return codenamesModule.definition.runMatch({
    ...contextBase, config: run.config as RunConfig<"codenames">,
    players: { "red-spymaster": red, "red-operative": red, "blue-spymaster": blue, "blue-operative": blue },
  });
}

console.log(`Worker ${workerId} started.`);
while (true) {
  const run = await repository.claimNextRun(workerId);
  if (!run) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    continue;
  }
  try {
    const result = await execute(run);
    await repository.finishRun(run.id, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await repository.failRun(run.id, message);
    console.error(`Run ${run.id} failed:`, error);
  }
}
