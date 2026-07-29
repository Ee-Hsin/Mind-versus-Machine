import type { ReplayRow } from "@ai-ramp/storage";
import { displayModelName, estimatedModelCost } from "./wordle";

interface Metric { actorId: string; seat?: string; role: "crew" | "imposter"; won: boolean; invalidActions: number;
  latencyMs: number; inputTokens: number; outputTokens: number }
interface Move { type: string; seat?: string; target?: string }
interface State { imposter?: string; moves?: Move[] }
interface Replay { metrics?: Metric[]; games?: { result?: { summary?: string }; finalState?: State }[] }
interface Acc { modelId: string; games: number; wins: number; crewGames: number; crewWins: number; imposterGames: number;
  imposterWins: number; crewAccusations: number; correctCrewAccusations: number; deceptionAttempts: number;
  playersDeceived: number; actions: number; invalid: number; latency: number;
  cost: number; priced: number }

export interface ImposterLeaderboardRow { rank: number; score: number; modelId: string; displayName: string;
  games: number; winRate: number; crewWinRate: number | null; imposterWinRate: number | null;
  accusationAccuracy: number; playerDeceivedRate: number | null;
  avgTimePerActionMs: number; costPerGame: number | null; invalidActionRate: number; provisional: boolean }

export function buildImposterLeaderboard(rows: ReplayRow[]): ImposterLeaderboardRow[] {
  const values = new Map<string, Acc>();
  for (const row of rows) {
    const replay = row.replay as Replay | null;
    const summary = replay?.games?.[0]?.result?.summary ?? "";
    if (summary.startsWith("Abandoned") || summary === "Game is still in progress.") continue;
    const state = replay?.games?.[0]?.finalState;
    for (const metric of replay?.metrics ?? []) {
      const seat = metric.seat ?? metric.actorId;
      const modelId = metric.actorId.includes(":") ? metric.actorId : modelForSeat(row, seat);
      if (!modelId) continue;
      const moves = state?.moves ?? [];
      const ownActions = moves.filter((move) => move.seat === seat || (move.type === "guess" && seat === state?.imposter));
      const ownVotes = ownActions.filter((move) => move.type === "vote");
      const crewVotes = moves.filter((move) => move.type === "vote" && move.seat !== state?.imposter);
      const current = values.get(modelId) ?? { modelId, games: 0, wins: 0, crewGames: 0, crewWins: 0,
        imposterGames: 0, imposterWins: 0, crewAccusations: 0, correctCrewAccusations: 0,
        deceptionAttempts: 0, playersDeceived: 0, actions: 0, invalid: 0,
        latency: 0, cost: 0, priced: 0 };
      const cost = estimatedModelCost(modelId, metric.inputTokens, metric.outputTokens);
      current.games++; current.wins += metric.won ? 1 : 0; current.actions += ownActions.length;
      current.invalid += metric.invalidActions; current.latency += metric.latencyMs;
      if (metric.role === "crew") {
        current.crewGames++; current.crewWins += metric.won ? 1 : 0;
        current.crewAccusations += ownVotes.length;
        current.correctCrewAccusations += ownVotes.filter((move) => move.target === state?.imposter).length;
      } else {
        current.imposterGames++; current.imposterWins += metric.won ? 1 : 0;
        current.deceptionAttempts += crewVotes.length;
        current.playersDeceived += crewVotes.filter((move) => move.target !== state?.imposter).length;
      }
      if (cost !== null) { current.cost += cost; current.priced++; }
      values.set(modelId, current);
    }
  }
  const cohort = [...values.values()];
  const total = cohort.reduce((sum, item) => sum + item.games, 0);
  const prior = total ? cohort.reduce((sum, item) => sum + item.wins, 0) / total : 0;
  const crewTotal = cohort.reduce((sum, item) => sum + item.crewGames, 0);
  const crewPrior = crewTotal ? cohort.reduce((sum, item) => sum + item.crewWins, 0) / crewTotal : prior;
  const impTotal = cohort.reduce((sum, item) => sum + item.imposterGames, 0);
  const impPrior = impTotal ? cohort.reduce((sum, item) => sum + item.imposterWins, 0) / impTotal : prior;
  const speed = inverseRanks(cohort, (item) => item.latency / Math.max(1, item.actions + item.invalid));
  const priced = cohort.filter((item) => item.priced === item.games);
  const costs = inverseRanks(priced, (item) => item.cost / item.games);
  return cohort.map((item) => {
    const attempts = item.actions + item.invalid;
    const adjusted = (item.wins + 5 * prior) / (item.games + 5);
    const roleBalance = (((item.crewWins + 3 * crewPrior) / (item.crewGames + 3))
      + ((item.imposterWins + 3 * impPrior) / (item.imposterGames + 3))) / 2;
    const accusationAccuracy = item.crewAccusations ? item.correctCrewAccusations / item.crewAccusations : 0.5;
    const playerDeceivedRate = item.deceptionAttempts ? item.playersDeceived / item.deceptionAttempts : null;
    const deceptionScore = playerDeceivedRate ?? 0.5;
    const validity = 1 - item.invalid / Math.max(1, attempts);
    return { rank: 0, modelId: item.modelId, displayName: displayModelName(item.modelId), games: item.games,
      score: 100 * (0.55 * adjusted + 0.15 * roleBalance + 0.10 * accusationAccuracy
        + 0.05 * deceptionScore + 0.05 * validity
        + 0.05 * (speed.get(item.modelId) ?? 0.5) + 0.05 * (costs.get(item.modelId) ?? 0.5)),
      winRate: item.wins / item.games, crewWinRate: item.crewGames ? item.crewWins / item.crewGames : null,
      imposterWinRate: item.imposterGames ? item.imposterWins / item.imposterGames : null,
      accusationAccuracy, playerDeceivedRate, avgTimePerActionMs: item.latency / Math.max(1, attempts),
      costPerGame: item.priced === item.games ? item.cost / item.games : null,
      invalidActionRate: item.invalid / Math.max(1, attempts), provisional: item.games < 10,
    };
  }).sort((a, b) => b.score - a.score || a.modelId.localeCompare(b.modelId))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function modelForSeat(row: ReplayRow, seat: string): string | null {
  if (row.config?.mode === "play" && seat === "P1") return null;
  const index = Number(seat.slice(1)) - (row.config?.mode === "play" ? 2 : 1);
  const models = row.config?.models ?? [];
  return Number.isInteger(index) && models.length ? models[index % models.length]?.id ?? null : null;
}
function inverseRanks(items: Acc[], value: (item: Acc) => number): Map<string, number> {
  const sorted = [...items].sort((a, b) => value(a) - value(b));
  if (sorted.length === 1) return new Map([[sorted[0].modelId, 1]]);
  return new Map(sorted.map((item, index) => [item.modelId, 1 - index / Math.max(1, sorted.length - 1)]));
}
