import type { ActorKind } from "@ai-ramp/protocol";
import type { WordleParticipantResult } from "@ai-ramp/storage";

/**
 * Every anonymous player aggregates into one row. When auth lands, a signed-in
 * player can additionally be broken out by joining `arena_players.user_id` — the
 * grouping key below is the only thing that has to change.
 */
export const HUMAN_COHORT_ID = "humans";

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
  actorId: string;
  actorKind: ActorKind;
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
  actorId: string;
  actorKind: ActorKind;
  displayName: string;
  games: number;
  successRate: number;
  avgGuessesPerWin: number | null;
  avgTimePerGuessMs: number | null;
  costPerGame: number | null;
  starterWord: string | null;
  invalidWordRate: number;
  provisional: boolean;
}

/**
 * Ranks every model and the human cohort against each other.
 *
 * Input is one row per *settled* board — the `wordle_participant_results` view
 * already drops forfeited and abandoned participants, and it drops them per
 * participant rather than per game, so the model boards from a game a human quit
 * still count here.
 */
export function buildWordleLeaderboard(results: WordleParticipantResult[]): WordleLeaderboardRow[] {
  const cohorts = new Map<string, Accumulator>();

  for (const result of results) {
    const actorId = result.actorKind === "model" ? result.modelId : HUMAN_COHORT_ID;
    if (!actorId) continue;

    const current = cohorts.get(actorId) ?? {
      actorId,
      actorKind: result.actorKind,
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

    current.games += 1;
    current.wins += result.won ? 1 : 0;
    current.winningGuesses += result.won ? result.guesses : 0;
    current.guesses += result.guesses;
    current.invalidActions += result.invalidActions;
    current.latencyMs += result.latencyMs;

    const estimatedCost = estimatedModelCost(actorId, result.inputTokens, result.outputTokens);
    if (estimatedCost !== null) {
      current.cost += estimatedCost;
      current.pricedGames += 1;
    }
    if (result.starterWord) {
      const starter = result.starterWord.toUpperCase();
      current.starters.set(starter, (current.starters.get(starter) ?? 0) + 1);
    }
    cohorts.set(actorId, current);
  }

  const cohort = [...cohorts.values()];
  const totalGames = cohort.reduce((sum, actor) => sum + actor.games, 0);
  const overallSuccessRate = totalGames
    ? cohort.reduce((sum, actor) => sum + actor.wins, 0) / totalGames
    : 0;

  // Speed and cost are model-efficiency measures that do not translate to a
  // person: human think time is not recorded (turn latency is stored as zero) and
  // a human costs no tokens. Humans are left out of both percentile cohorts and
  // pick up the neutral 0.5, so these two components neither reward nor penalise
  // them — the ranking turns on solving ability instead.
  const models = cohort.filter((actor) => actor.actorKind === "model");
  const speedScores = efficiencyPercentiles(models, (actor) => {
    const attempts = actor.guesses + actor.invalidActions;
    return attempts ? actor.latencyMs / attempts : Number.POSITIVE_INFINITY;
  });
  const costScores = efficiencyPercentiles(
    models.filter((actor) => actor.pricedGames === actor.games),
    (actor) => actor.cost / actor.games,
  );

  return cohort
    .map((actor) => {
      const attempts = actor.guesses + actor.invalidActions;
      const adjustedSuccess = (actor.wins + (5 * overallSuccessRate)) / (actor.games + 5);
      const guessEfficiency = actor.wins
        ? Math.max(0, Math.min(1, (6 - (actor.winningGuesses / actor.wins)) / 5))
        : 0;
      const validity = attempts ? 1 - (actor.invalidActions / attempts) : 0;
      const speedEfficiency = speedScores.get(actor.actorId) ?? 0.5;
      const costEfficiency = costScores.get(actor.actorId) ?? 0.5;
      const isHuman = actor.actorKind === "human";
      return {
        rank: 0,
        score: 100 * ((0.65 * adjustedSuccess) + (0.15 * guessEfficiency)
          + (0.10 * validity) + (0.05 * speedEfficiency) + (0.05 * costEfficiency)),
        actorId: actor.actorId,
        actorKind: actor.actorKind,
        displayName: isHuman ? "All humans" : displayModelName(actor.actorId),
        games: actor.games,
        successRate: actor.wins / actor.games,
        avgGuessesPerWin: actor.wins ? actor.winningGuesses / actor.wins : null,
        avgTimePerGuessMs: isHuman || !attempts ? null : actor.latencyMs / attempts,
        costPerGame: !isHuman && actor.pricedGames === actor.games ? actor.cost / actor.games : null,
        starterWord: mostCommonStarter(actor.starters),
        invalidWordRate: attempts ? actor.invalidActions / attempts : 0,
        provisional: actor.games < 10,
      };
    })
    .sort((a, b) => b.score - a.score || a.actorId.localeCompare(b.actorId))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function efficiencyPercentiles(
  actors: Accumulator[],
  value: (actor: Accumulator) => number,
): Map<string, number> {
  if (actors.length === 0) return new Map();
  if (actors.length === 1) return new Map([[actors[0].actorId, 1]]);
  const sorted = [...actors].sort((a, b) => value(a) - value(b));
  const result = new Map<string, number>();
  for (let start = 0; start < sorted.length;) {
    let end = start;
    while (end + 1 < sorted.length && value(sorted[end + 1]) === value(sorted[start])) end += 1;
    const averageRank = (start + end) / 2;
    const score = 1 - (averageRank / (sorted.length - 1));
    for (let index = start; index <= end; index += 1) result.set(sorted[index].actorId, score);
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
