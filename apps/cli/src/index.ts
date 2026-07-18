import { randomUUID } from "node:crypto";
import { INITIAL_ELO, runPool, updateElo, type ModelPlayer } from "@ai-ramp/engine";
import { codenamesModule } from "@ai-ramp/game-codenames";
import { imposterModule } from "@ai-ramp/game-imposter";
import { wordleModule } from "@ai-ramp/game-wordle";
import { AiSdkModelPlayer } from "@ai-ramp/model-runtime";
import { IMPOSTER_SEATS, type ArenaEvent, type RunConfig } from "@ai-ramp/protocol";
import { createSupabaseRepository } from "@ai-ramp/storage";
import type { z } from "zod";

function argument(name: string, fallback: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

/** Human-friendly elapsed time, e.g. "27s", "1m 23s", "1h 2m 5s". */
function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h ? `${h}h` : null, h || m ? `${m}m` : null, `${sec}s`].filter(Boolean).join(" ");
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

const game = argument("game", "wordle") as "wordle" | "codenames" | "imposter";
if (game !== "wordle" && game !== "codenames" && game !== "imposter") throw new Error(`Unknown game: ${game}`);
const modelIds = argument("models", "random-a,random-b").split(",").map((id) => id.trim()).filter(Boolean);
// Codenames is a two-team head-to-head; Wordle is an N-way heat (all models race the same word).
if (game === "codenames" && modelIds.length !== 2) throw new Error("Codenames needs exactly two models: --models <a>,<b>");
if (game === "imposter" && modelIds.length !== 6) throw new Error("Imposter needs exactly six models.");
if (game === "wordle" && modelIds.length < 2) throw new Error("Wordle needs at least two models: --models <a>,<b>[,<c>,...]");
const matches = Number(argument("n", "3"));
const concurrency = Number(argument("concurrency", "2"));
const player = (id: string): ModelPlayer => id.startsWith("random")
  ? new RandomPlayer(id, game === "imposter" ? "codenames" : game)
  : new AiSdkModelPlayer(id);

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

/** Per-actor metric fields we read here (superset-safe across both games). */
interface ActorMetric {
  actorId: string;
  score: number;
  won: boolean;
  guesses?: number;
  team?: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}
interface MatchResult {
  metrics: ActorMetric[];
  input: number;
  output: number;
  ms: number;
}

const tasks = Array.from({ length: matches }, (_, index) => async (): Promise<MatchResult> => {
  const runId = persistedRun?.id ?? randomUUID();
  const startedMatch = Date.now();
  if (game === "wordle") {
    const result = await wordleModule.definition.runMatch({
      runId, matchNumber: index + 1, config: config as RunConfig<"wordle">, events,
      players: Object.fromEntries(modelIds.map((id) => [id, player(id)])),
    });
    return {
      metrics: result.metrics,
      input: result.metrics.reduce((sum, value) => sum + value.inputTokens, 0),
      output: result.metrics.reduce((sum, value) => sum + value.outputTokens, 0),
      ms: Date.now() - startedMatch,
    };
  }
  if (game === "imposter") {
    const result = await imposterModule.definition.runMatch({
      runId, matchNumber: index + 1, config: config as RunConfig<"imposter">, events,
      players: Object.fromEntries(IMPOSTER_SEATS.map((seat, seatIndex) => [seat, player(modelIds[seatIndex])])),
    });
    return {
      metrics: result.metrics,
      input: result.metrics.reduce((sum, value) => sum + value.inputTokens, 0),
      output: result.metrics.reduce((sum, value) => sum + value.outputTokens, 0),
      ms: Date.now() - startedMatch,
    };
  }
  const red = player(modelIds[0]);
  const blue = player(modelIds[1]);
  const result = await codenamesModule.definition.runMatch({
    runId, matchNumber: index + 1, config: config as RunConfig<"codenames">, events,
    players: { "red-spymaster": red, "red-operative": red, "blue-spymaster": blue, "blue-operative": blue },
  });
  return {
    metrics: result.metrics,
    input: result.metrics.reduce((sum, value) => sum + value.inputTokens, 0),
    output: result.metrics.reduce((sum, value) => sum + value.outputTokens, 0),
    ms: Date.now() - startedMatch,
  };
});

const startedAt = Date.now();
const settled = await runPool(tasks, concurrency);
const results = settled.flatMap((item) => {
  if (item.status === "fulfilled") return [item.value];
  console.error("Match failed:", item.reason instanceof Error ? item.reason.message : String(item.reason));
  return [];
});
const failures = settled.filter((item) => item.status === "rejected");

// --- Persist run + ratings ------------------------------------------------
if (repository && persistedRun) {
  if (failures.length) await repository.failRun(persistedRun.id, `${failures.length} match(es) failed.`);
  else await repository.finishRun(persistedRun.id, { results: results.map(({ metrics }) => metrics) });

  if (!failures.length && results.length) {
    if (game === "wordle") {
      // Round-robin Elo: within each match every pair of models is scored head-to-head.
      const models = [...new Set(results.flatMap((r) => r.metrics.map((m) => m.actorId)))];
      if (models.length >= 2) {
        const stored = new Map(
          await Promise.all(models.map(async (m) => [m, await repository.loadRating(m, game)] as const)),
        );
        const elo = new Map(models.map((m) => [m, stored.get(m)?.elo ?? INITIAL_ELO]));
        for (const r of results) {
          for (let i = 0; i < r.metrics.length; i++) {
            for (let j = i + 1; j < r.metrics.length; j++) {
              const a = r.metrics[i];
              const b = r.metrics[j];
              const outcomeA = a.score > b.score ? 1 : a.score < b.score ? 0 : 0.5;
              const updated = updateElo(elo.get(a.actorId) ?? INITIAL_ELO, elo.get(b.actorId) ?? INITIAL_ELO, outcomeA);
              elo.set(a.actorId, updated.ratingA);
              elo.set(b.actorId, updated.ratingB);
            }
          }
        }
        await Promise.all(models.map((m) => repository.saveRating({
          model: m, gameType: game, elo: elo.get(m) ?? INITIAL_ELO,
          gamesPlayed: (stored.get(m)?.gamesPlayed ?? 0) + results.length,
        })));
      }
    } else if (game === "codenames" && modelIds[0] !== modelIds[1]) {
      // Codenames: two-way Elo from each match's red-perspective outcome.
      const [storedA, storedB] = await Promise.all([
        repository.loadRating(modelIds[0], game), repository.loadRating(modelIds[1], game),
      ]);
      let ratingA = storedA?.elo ?? INITIAL_ELO;
      let ratingB = storedB?.elo ?? INITIAL_ELO;
      for (const r of results) {
        const redWon = r.metrics.find((m) => m.team === "red")?.won ? 1 : 0;
        ({ ratingA, ratingB } = updateElo(ratingA, ratingB, redWon));
      }
      await Promise.all([
        repository.saveRating({ model: modelIds[0], gameType: game, elo: ratingA, gamesPlayed: (storedA?.gamesPlayed ?? 0) + results.length }),
        repository.saveRating({ model: modelIds[1], gameType: game, elo: ratingB, gamesPlayed: (storedB?.gamesPlayed ?? 0) + results.length }),
      ]);
    }
  }
  console.log(`Supabase run: ${persistedRun.id}`);
  if (failures.length) process.exitCode = 1;
}

// --- Results output -------------------------------------------------------
if (game === "wordle") {
  // Aggregate per model across all matches (each model played every word once).
  const agg = new Map<string, { matches: number; solves: number; guessesOnSolves: number; latencyMs: number; input: number; output: number }>();
  for (const r of results) {
    for (const m of r.metrics) {
      const a = agg.get(m.actorId) ?? { matches: 0, solves: 0, guessesOnSolves: 0, latencyMs: 0, input: 0, output: 0 };
      a.matches++;
      if (m.won) {
        a.solves++;
        a.guessesOnSolves += m.guesses ?? 0;
      }
      a.latencyMs += m.latencyMs;
      a.input += m.inputTokens;
      a.output += m.outputTokens;
      agg.set(m.actorId, a);
    }
  }
  const board = [...agg.entries()]
    .map(([model, a]) => ({
      model, ...a,
      solveRate: a.matches ? a.solves / a.matches : 0,
      avgGuesses: a.solves ? a.guessesOnSolves / a.solves : Infinity,
    }))
    .sort((x, y) => y.solveRate - x.solveRate || x.avgGuesses - y.avgGuesses || x.latencyMs - y.latencyMs);
  console.log(`\n[wordle] leaderboard — ${results.length} match(es), ${modelIds.length} models racing the same word each:`);
  const width = Math.max(5, ...board.map((row) => row.model.length));
  board.forEach((row, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}. ${row.model.padEnd(width)}  ` +
        `solved ${row.solves}/${row.matches}  ` +
        `avg ${row.solves ? row.avgGuesses.toFixed(1) : "—"} guesses  ` +
        `think ${formatDuration(row.latencyMs)}  ` +
        `tok ${row.input}/${row.output}`,
    );
  });
} else if (game === "codenames") {
  const wins = results.filter((r) => r.metrics.find((m) => m.team === "red")?.won).length;
  console.log(`[codenames] ${modelIds[0]} (red) vs ${modelIds[1]} (blue): ${wins}W / ${results.length - wins}L`);
} else {
  const wins = new Map<string, number>(modelIds.map((id) => [id, 0]));
  for (const result of results) for (const metric of result.metrics) {
    if (metric.won) wins.set(metric.actorId, (wins.get(metric.actorId) ?? 0) + 1);
  }
  console.log(`[imposter] ${results.length} match(es): ${[...wins].map(([id, count]) => `${id} ${count}W`).join(", ")}`);
}

console.log(`Tokens: ${results.reduce((n, value) => n + value.input, 0)} in / ${results.reduce((n, value) => n + value.output, 0)} out`);
const avgMatchMs = results.length ? Math.round(results.reduce((n, value) => n + value.ms, 0) / results.length) : 0;
console.log(
  `Total run time: ${formatDuration(Date.now() - startedAt)}` +
    (results.length ? ` (${results.length} match(es), avg ${formatDuration(avgMatchMs)}/match, concurrency ${concurrency})` : ""),
);
