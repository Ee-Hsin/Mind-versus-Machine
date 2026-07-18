import type { ReplayRow } from "@ai-ramp/storage";
import { displayModelName, estimatedModelCost } from "./wordle";

interface Metric {
  actorId: string; team: "red" | "blue"; won: boolean; clues: number; guesses: number;
  invalidActions: number; latencyMs: number; inputTokens: number; outputTokens: number;
}
interface Replay { metrics?: Metric[]; games?: { result?: { summary?: string } }[] }
interface Acc { modelId: string; games: number; wins: number; clues: number; guesses: number; invalid: number;
  latency: number; cost: number; priced: number; assassinLosses: number }

export interface CodenamesLeaderboardRow {
  rank: number; score: number; modelId: string; displayName: string; games: number; winRate: number;
  guessesPerClue: number; actionsPerGame: number; avgTimePerActionMs: number; costPerGame: number | null;
  invalidActionRate: number; assassinLossRate: number; provisional: boolean;
}

export function buildCodenamesLeaderboard(rows: ReplayRow[]): CodenamesLeaderboardRow[] {
  const values = new Map<string, Acc>();
  for (const row of rows) {
    const replay = row.replay as Replay | null;
    const summary = replay?.games?.[0]?.result?.summary ?? "";
    if (summary.startsWith("Abandoned") || summary === "Game is still in progress.") continue;
    for (const metric of replay?.metrics ?? []) {
      const modelId = resolveModel(metric, row);
      if (!modelId || modelId.startsWith("human")) continue;
      const current = values.get(modelId) ?? { modelId, games: 0, wins: 0, clues: 0, guesses: 0,
        invalid: 0, latency: 0, cost: 0, priced: 0, assassinLosses: 0 };
      const cost = estimatedModelCost(modelId, metric.inputTokens, metric.outputTokens);
      current.games++; current.wins += metric.won ? 1 : 0; current.clues += metric.clues;
      current.guesses += metric.guesses; current.invalid += metric.invalidActions; current.latency += metric.latencyMs;
      if (cost !== null) { current.cost += cost; current.priced++; }
      if (!metric.won && replay?.games?.[0]?.result?.summary?.includes("assassin")) current.assassinLosses++;
      values.set(modelId, current);
    }
  }
  const cohort = [...values.values()];
  const totalGames = cohort.reduce((sum, item) => sum + item.games, 0);
  const prior = totalGames ? cohort.reduce((sum, item) => sum + item.wins, 0) / totalGames : 0;
  const speed = inverseRanks(cohort, (item) => item.latency / Math.max(1, item.clues + item.guesses + item.invalid));
  const priced = cohort.filter((item) => item.priced === item.games);
  const cost = inverseRanks(priced, (item) => item.cost / item.games);
  return cohort.map((item) => {
    const actions = item.clues + item.guesses + item.invalid;
    const adjustedWin = (item.wins + 5 * prior) / (item.games + 5);
    const clueEfficiency = Math.min(1, item.guesses / Math.max(1, item.clues * 3));
    const validity = 1 - item.invalid / Math.max(1, actions);
    return {
      rank: 0, modelId: item.modelId, displayName: displayModelName(item.modelId), games: item.games,
      score: 100 * (0.70 * adjustedWin + 0.05 * clueEfficiency + 0.10 * validity
        + 0.05 * (1 - item.assassinLosses / item.games)
        + 0.05 * (speed.get(item.modelId) ?? 0.5) + 0.05 * (cost.get(item.modelId) ?? 0.5)),
      winRate: item.wins / item.games, guessesPerClue: item.guesses / Math.max(1, item.clues),
      actionsPerGame: actions / item.games, avgTimePerActionMs: item.latency / Math.max(1, actions),
      costPerGame: item.priced === item.games ? item.cost / item.games : null,
      invalidActionRate: item.invalid / Math.max(1, actions), assassinLossRate: item.assassinLosses / item.games,
      provisional: item.games < 10,
    };
  }).sort((a, b) => b.score - a.score || a.modelId.localeCompare(b.modelId))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function resolveModel(metric: Metric, row: ReplayRow): string | null {
  if (metric.actorId.includes(":")) return metric.actorId;
  return row.config?.models[metric.team === "red" ? 0 : 1]?.id ?? null;
}

function inverseRanks(items: Acc[], value: (item: Acc) => number): Map<string, number> {
  const sorted = [...items].sort((a, b) => value(a) - value(b));
  if (sorted.length === 1) return new Map([[sorted[0].modelId, 1]]);
  return new Map(sorted.map((item, index) => [item.modelId, 1 - index / Math.max(1, sorted.length - 1)]));
}
