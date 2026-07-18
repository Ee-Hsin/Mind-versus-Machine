import { randomUUID } from "node:crypto";
import { runAdapter, runPool, type ModelPlayer } from "@ai-ramp/engine";
import { CodenamesAdapter, CodenamesModel } from "@ai-ramp/game-codenames";
import { WordleAdapter, WordleModel } from "@ai-ramp/game-wordle";
import { AiSdkModelPlayer } from "@ai-ramp/model-runtime";
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

const tasks = Array.from({ length: matches }, (_, index) => async () => {
  if (game === "wordle") {
    const first = new WordleModel();
    const state = first.serialize();
    const a = new WordleAdapter("A", first);
    const b = new WordleAdapter("B", new WordleModel({ answer: state.answer, guesses: [] }));
    const [resultA, resultB] = await Promise.all([
      runAdapter(a, { A: player(modelIds[0]) }),
      runAdapter(b, { B: player(modelIds[1]) }),
    ]);
    const scoreA = resultA.result.scores.A ?? 0;
    const scoreB = resultB.result.scores.B ?? 0;
    return { outcome: scoreA > scoreB ? 1 : scoreA < scoreB ? 0 : 0.5, input: resultA.inputTokens + resultB.inputTokens, output: resultA.outputTokens + resultB.outputTokens };
  }
  const adapter = new CodenamesAdapter(new CodenamesModel());
  const result = await runAdapter(adapter, {
    "red-spymaster": player(modelIds[0]), "red-operative": player(modelIds[0]),
    "blue-spymaster": player(modelIds[1]), "blue-operative": player(modelIds[1]),
  });
  return { outcome: result.abandoned ? 0.5 : result.result.scores.red, input: result.inputTokens, output: result.outputTokens };
});

const settled = await runPool(tasks, concurrency);
const results = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : (console.error(item.reason), []));
const wins = results.filter(({ outcome }) => outcome === 1).length;
const losses = results.filter(({ outcome }) => outcome === 0).length;
console.log(`[${game}] ${modelIds[0]} vs ${modelIds[1]}: ${wins}W / ${results.length - wins - losses}D / ${losses}L`);
console.log(`Tokens: ${results.reduce((n, value) => n + value.input, 0)} in / ${results.reduce((n, value) => n + value.output, 0)} out`);
