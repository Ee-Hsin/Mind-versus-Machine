import { randomUUID } from "node:crypto";
import { INITIAL_ELO, runPool, updateElo, type ModelPlayer } from "@ai-ramp/engine";
import { codenamesModule } from "@ai-ramp/game-codenames";
import { wordleModule } from "@ai-ramp/game-wordle";
import { AiSdkModelPlayer } from "@ai-ramp/model-runtime";
import type { ArenaEvent, RunConfig } from "@ai-ramp/protocol";
import { createSupabaseRepository } from "@ai-ramp/storage";
import type { z } from "zod";

function argument(name: string, fallback: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

class RandomPlayer implements ModelPlayer {
  constructor(readonly id: string, private readonly game: "wordle" | "codenames") {}
  async act<Action>(_system: string, prompt: string, _schema: z.ZodType<Action>) {
    let action: unknown;
    if (this.game === "wordle") {
      const guesses = ["CRANE", "SLATE", "AUDIO", "POINT", "BRICK", "MOUSE"];
      const used = new Set(prompt.match(/Word \d+:\s+([A-Z]{5})/g)?.map((row) => row.slice(-5)) ?? []);
      action = { guess: guesses.find((guess) => !used.has(guess)) ?? "CRANE" };
    } else if (/spymaster's clue/i.test(prompt)) {
      action = { type: "clue", word: `hint${randomUUID().replace(/\d/g, "a").slice(0, 6)}`, number: 1 };
    } else {
      const grid = prompt.split("\n")
        .filter((line) => /^[A-Z()*\s]+$/.test(line) && /[A-Z]/.test(line))
        .join(" ");
      const unrevealed = grid.replace(/[A-Z]+\s*\((?:RED|BLU|NEU|ASN)\)/g, " ").match(/[A-Z]+/g) ?? [];
      action = unrevealed.length
        ? { type: "guess", word: unrevealed[Math.floor(Math.random() * unrevealed.length)] }
        : { type: "stop" };
    }
    return { action: action as Action, latencyMs: 0, inputTokens: 0, outputTokens: 0 };
  }
}

const game = argument("game", "wordle");
if (game !== "wordle" && game !== "codenames") throw new Error(`Unknown game: ${game}`);
const modelIds = argument("models", "random-a,random-b").split(",");
if (modelIds.length !== 2) throw new Error("Expected exactly two comma-separated models.");
const matches = Number(argument("n", "3"));
const concurrency = Number(argument("concurrency", "2"));
const player = (id: string): ModelPlayer => id.startsWith("random") ? new RandomPlayer(id, game) : new AiSdkModelPlayer(id);

const config: RunConfig = {
  gameType: game,
  mode: "benchmark",
  gameConfig: {},
  models: modelIds.map((id) => ({ id, displayName: id })),
  matches,
  concurrency,
};
const hasDatabase = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
const repository = hasDatabase ? createSupabaseRepository() : null;
const persistedRun = repository ? await repository.createRun(config, "running") : null;
let sequence = 0;
const events = {
  async publish(event: ArenaEvent) {
    const sequenced = { ...event, sequence: ++sequence };
    await repository?.appendEvent(sequenced);
  },
};

const tasks = Array.from({ length: matches }, (_, index) => async () => {
  const runId = persistedRun?.id ?? randomUUID();
  if (game === "wordle") {
    const result = await wordleModule.definition.runMatch({
      runId, matchNumber: index + 1, config: config as RunConfig<"wordle">, events,
      players: Object.fromEntries(modelIds.map((id) => [id, player(id)])),
    });
    const [a, b] = result.metrics;
    return { outcome: a.score > b.score ? 1 : a.score < b.score ? 0 : 0.5,
      input: result.metrics.reduce((sum, value) => sum + value.inputTokens, 0),
      output: result.metrics.reduce((sum, value) => sum + value.outputTokens, 0), metrics: result.metrics };
  }
  const red = player(modelIds[0]);
  const blue = player(modelIds[1]);
  const result = await codenamesModule.definition.runMatch({
    runId, matchNumber: index + 1, config: config as RunConfig<"codenames">, events,
    players: { "red-spymaster": red, "red-operative": red, "blue-spymaster": blue, "blue-operative": blue },
  });
  return { outcome: result.metrics.find((value) => value.team === "red")?.won ? 1 : 0,
    input: result.metrics.reduce((sum, value) => sum + value.inputTokens, 0),
    output: result.metrics.reduce((sum, value) => sum + value.outputTokens, 0), metrics: result.metrics };
});

const settled = await runPool(tasks, concurrency);
const results = settled.flatMap((item) => {
  if (item.status === "fulfilled") return [item.value];
  console.error("Match failed:", item.reason instanceof Error ? item.reason.message : String(item.reason));
  return [];
});
const wins = results.filter(({ outcome }) => outcome === 1).length;
const losses = results.filter(({ outcome }) => outcome === 0).length;
if (repository && persistedRun) {
  const failures = settled.filter((item) => item.status === "rejected");
  if (failures.length) await repository.failRun(persistedRun.id, `${failures.length} match(es) failed.`);
  else await repository.finishRun(persistedRun.id, { results: results.map(({ metrics }) => metrics) });
  if (!failures.length && modelIds[0] !== modelIds[1] && results.length) {
    const [storedA, storedB] = await Promise.all([
      repository.loadRating(modelIds[0], game), repository.loadRating(modelIds[1], game),
    ]);
    let ratingA = storedA?.elo ?? INITIAL_ELO;
    let ratingB = storedB?.elo ?? INITIAL_ELO;
    for (const result of results) ({ ratingA, ratingB } = updateElo(ratingA, ratingB, result.outcome));
    await Promise.all([
      repository.saveRating({ model: modelIds[0], gameType: game, elo: ratingA,
        gamesPlayed: (storedA?.gamesPlayed ?? 0) + results.length }),
      repository.saveRating({ model: modelIds[1], gameType: game, elo: ratingB,
        gamesPlayed: (storedB?.gamesPlayed ?? 0) + results.length }),
    ]);
  }
  console.log(`Supabase run: ${persistedRun.id}`);
  if (failures.length) process.exitCode = 1;
}
console.log(`[${game}] ${modelIds[0]} vs ${modelIds[1]}: ${wins}W / ${results.length - wins - losses}D / ${losses}L`);
console.log(`Tokens: ${results.reduce((n, value) => n + value.input, 0)} in / ${results.reduce((n, value) => n + value.output, 0)} out`);
