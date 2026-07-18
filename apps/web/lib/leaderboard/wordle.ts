import type { ReplayRow } from "@ai-ramp/storage";

interface WordleMetric {
  actorId: string;
  won: boolean;
  guesses: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  invalidActions: number;
}

interface WordleGameReplay {
  gameId: string;
  finalState?: { guesses?: string[] };
}

interface WordleReplay {
  games?: WordleGameReplay[];
  metrics?: WordleMetric[];
}

interface Price {
  input: number;
  output: number;
}

// Standard API prices in USD per million tokens. Cost is an estimate and does
// not account for provider-specific caching, free tiers, or negotiated rates.
const PRICES: Record<string, Price> = {
  "openai:gpt-5.6-luna": { input: 1, output: 6 },
  "anthropic:claude-haiku-4-5": { input: 1, output: 5 },
  "google:gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "xai:grok-4-fast-non-reasoning": { input: 1.25, output: 2.5 },
  "cohere:command-r7b-12-2024": { input: 0.0375, output: 0.15 },
  "deepseek:deepseek-v4-flash": { input: 0.14, output: 0.28 },
};

export function estimatedModelCost(modelId: string, inputTokens: number, outputTokens: number): number | null {
  const price = PRICES[modelId];
  return price ? ((inputTokens * price.input) + (outputTokens * price.output)) / 1_000_000 : null;
}

interface Accumulator {
  modelId: string;
  games: number;
  wins: number;
  winningGuesses: number;
  guesses: number;
  invalidActions: number;
  latencyMs: number;
  cost: number;
  pricedGames: number;
  starters: Map<string, number>;
}

export interface WordleLeaderboardRow {
  rank: number;
  score: number;
  modelId: string;
  displayName: string;
  games: number;
  successRate: number;
  avgGuessesPerWin: number | null;
  avgTimePerGuessMs: number;
  costPerGame: number | null;
  starterWord: string | null;
  invalidWordRate: number;
  provisional: boolean;
}

export function buildWordleLeaderboard(rows: ReplayRow[]): WordleLeaderboardRow[] {
  const models = new Map<string, Accumulator>();

  for (const row of rows) {
    const replay = row.replay as WordleReplay | null;
    if (!replay?.metrics) continue;
    const games = new Map((replay.games ?? []).map((game) => [game.gameId, game]));

    for (const metric of replay.metrics) {
      if (!isModelMetric(metric)) continue;
      const estimatedCost = estimatedModelCost(metric.actorId, metric.inputTokens, metric.outputTokens);
      const current = models.get(metric.actorId) ?? {
        modelId: metric.actorId,
        games: 0,
        wins: 0,
        winningGuesses: 0,
        guesses: 0,
        invalidActions: 0,
        latencyMs: 0,
        cost: 0,
        pricedGames: 0,
        starters: new Map<string, number>(),
      };
      const starter = games.get(metric.actorId)?.finalState?.guesses?.[0]?.toUpperCase();

      current.games += 1;
      current.wins += metric.won ? 1 : 0;
      current.winningGuesses += metric.won ? metric.guesses : 0;
      current.guesses += metric.guesses;
      current.invalidActions += metric.invalidActions;
      current.latencyMs += metric.latencyMs;
      if (estimatedCost !== null) {
        current.cost += estimatedCost;
        current.pricedGames += 1;
      }
      if (starter) current.starters.set(starter, (current.starters.get(starter) ?? 0) + 1);
      models.set(metric.actorId, current);
    }
  }

  const cohort = [...models.values()];
  const totalGames = cohort.reduce((sum, model) => sum + model.games, 0);
  const overallSuccessRate = totalGames
    ? cohort.reduce((sum, model) => sum + model.wins, 0) / totalGames
    : 0;
  const speedScores = efficiencyPercentiles(cohort, (model) => {
    const attempts = model.guesses + model.invalidActions;
    return attempts ? model.latencyMs / attempts : Number.POSITIVE_INFINITY;
  });
  const costScores = efficiencyPercentiles(
    cohort.filter((model) => model.pricedGames === model.games),
    (model) => model.cost / model.games,
  );

  return cohort
    .map((model) => {
      const attempts = model.guesses + model.invalidActions;
      const adjustedSuccess = (model.wins + (5 * overallSuccessRate)) / (model.games + 5);
      const guessEfficiency = model.wins
        ? Math.max(0, Math.min(1, (6 - (model.winningGuesses / model.wins)) / 5))
        : 0;
      const validity = attempts ? 1 - (model.invalidActions / attempts) : 0;
      const speedEfficiency = speedScores.get(model.modelId) ?? 0.5;
      const costEfficiency = costScores.get(model.modelId) ?? 0.5;
      return {
        rank: 0,
        score: 100 * ((0.65 * adjustedSuccess) + (0.15 * guessEfficiency)
          + (0.10 * validity) + (0.05 * speedEfficiency) + (0.05 * costEfficiency)),
        modelId: model.modelId,
        displayName: displayModelName(model.modelId),
        games: model.games,
        successRate: model.wins / model.games,
        avgGuessesPerWin: model.wins ? model.winningGuesses / model.wins : null,
        avgTimePerGuessMs: attempts ? model.latencyMs / attempts : 0,
        costPerGame: model.pricedGames === model.games ? model.cost / model.games : null,
        starterWord: mostCommonStarter(model.starters),
        invalidWordRate: attempts ? model.invalidActions / attempts : 0,
        provisional: model.games < 10,
      };
    })
    .sort((a, b) => b.score - a.score || a.modelId.localeCompare(b.modelId))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function isModelMetric(value: unknown): value is WordleMetric {
  if (!value || typeof value !== "object") return false;
  const metric = value as Partial<WordleMetric>;
  return typeof metric.actorId === "string" && metric.actorId.includes(":")
    && typeof metric.won === "boolean" && typeof metric.guesses === "number"
    && typeof metric.latencyMs === "number" && typeof metric.inputTokens === "number"
    && typeof metric.outputTokens === "number" && typeof metric.invalidActions === "number";
}

function efficiencyPercentiles(
  models: Accumulator[],
  value: (model: Accumulator) => number,
): Map<string, number> {
  if (models.length === 1) return new Map([[models[0].modelId, 1]]);
  const sorted = [...models].sort((a, b) => value(a) - value(b));
  const result = new Map<string, number>();
  for (let start = 0; start < sorted.length;) {
    let end = start;
    while (end + 1 < sorted.length && value(sorted[end + 1]) === value(sorted[start])) end += 1;
    const averageRank = (start + end) / 2;
    const score = 1 - (averageRank / (sorted.length - 1));
    for (let index = start; index <= end; index += 1) result.set(sorted[index].modelId, score);
    start = end + 1;
  }
  return result;
}

function mostCommonStarter(starters: Map<string, number>): string | null {
  return [...starters.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

export function displayModelName(modelId: string): string {
  return modelId.split(":").slice(1).join(":").replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
