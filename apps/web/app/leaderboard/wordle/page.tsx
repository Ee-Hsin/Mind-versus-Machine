import { InfoIcon, TrophyIcon } from "lucide-react";
import { LeaderboardTabs } from "@/components/leaderboard-tabs";
import { repository } from "@/lib/api/repository";
import { buildWordleLeaderboard } from "@/lib/leaderboard/wordle";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WordleLeaderboardPage() {
  const leaderboard = buildWordleLeaderboard(await repository().listWordleResults());
  const totalBoards = leaderboard.reduce((sum, row) => sum + row.games, 0);
  const modelCount = leaderboard.filter((row) => row.actorKind === "model").length;
  const humanBoards = leaderboard.find((row) => row.actorKind === "human")?.games ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 py-10 sm:py-16">
      <header className="flex flex-col gap-4">
        <LeaderboardTabs active="wordle" />
        <div className="flex size-11 items-center justify-center rounded-xl border bg-card shadow-sm">
          <TrophyIcon className="size-5 text-wordle-present" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">Game leaderboard</p>
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">Wordle</h1>
          <p className="max-w-2xl text-muted-foreground">
            Every model and every human who has played, ranked on the same board with a balanced
            Wordle evaluation score.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <span className="rounded-full border bg-card px-3 py-1">{modelCount} models</span>
          <span className="rounded-full border bg-card px-3 py-1">{humanBoards} human boards</span>
          <span className="rounded-full border bg-card px-3 py-1">{totalBoards} boards total</span>
        </div>
      </header>

      <section aria-labelledby="wordle-rankings" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2 className="font-heading font-semibold" id="wordle-rankings">Rankings</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Fewer than 10 boards is provisional.</p>
          </div>
          <div className="group relative">
            <button
              aria-describedby="wordle-score-formula"
              aria-label="How the Wordle score is calculated"
              className="flex size-9 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              type="button"
            >
              <InfoIcon className="size-4" aria-hidden="true" />
            </button>
            <div
              className="pointer-events-none absolute top-11 right-0 z-20 hidden w-80 rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-xl group-hover:block group-focus-within:block"
              id="wordle-score-formula"
              role="tooltip"
            >
              <p className="font-medium">Wordle Score</p>
              <p className="mt-2 leading-5 text-muted-foreground">
                65% Bayesian-adjusted success + 15% guess efficiency + 10% valid-word rate
                + 5% speed efficiency + 5% cost efficiency.
              </p>
              <p className="mt-2 leading-5 text-muted-foreground">
                Success is adjusted toward the overall field by five prior games, preventing anyone from ranking first after one lucky win.
              </p>
              <p className="mt-2 leading-5 text-muted-foreground">
                Humans score neutrally on speed and cost. Neither translates to a person — think time
                is not recorded and a human burns no tokens — so those components neither reward nor
                penalise the human row.
              </p>
            </div>
          </div>
        </div>
        {leaderboard.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[70rem] border-collapse text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-4 font-medium">Rank</th>
                  <th className="px-5 py-4 font-medium">Player</th>
                  <th className="px-5 py-4 text-right font-medium">Score</th>
                  <th className="px-5 py-4 text-right font-medium">Success rate</th>
                  <th className="px-5 py-4 text-right font-medium">Avg guesses / win</th>
                  <th className="px-5 py-4 text-right font-medium">Avg time / guess</th>
                  <th className="px-5 py-4 text-right font-medium">Est. cost / game</th>
                  <th className="px-5 py-4 text-right font-medium">Top starter</th>
                  <th className="px-5 py-4 text-right font-medium">Invalid word rate</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row) => (
                  <tr
                    className={cn(
                      "border-t transition-colors hover:bg-muted/30",
                      // The human cohort is the row people came to compare against.
                      row.actorKind === "human" && "bg-wordle-present/10 hover:bg-wordle-present/15",
                    )}
                    key={row.actorId}
                  >
                    <td className="px-5 py-4 font-mono text-muted-foreground">#{row.rank}</td>
                    <td className="px-5 py-4">
                      <div className="font-medium">{row.displayName}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {row.games} games{row.provisional ? " · Provisional" : ""}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right font-mono font-semibold">{row.score.toFixed(1)}</td>
                    <td className="px-5 py-4 text-right font-mono font-medium">{percent(row.successRate)}</td>
                    <td className="px-5 py-4 text-right font-mono">{row.avgGuessesPerWin?.toFixed(2) ?? "—"}</td>
                    <td className="px-5 py-4 text-right font-mono">{formatDuration(row.avgTimePerGuessMs)}</td>
                    <td className="px-5 py-4 text-right font-mono">{formatCost(row.costPerGame)}</td>
                    <td className="px-5 py-4 text-right font-mono font-medium tracking-wider">{row.starterWord ?? "—"}</td>
                    <td className="px-5 py-4 text-right font-mono">{percent(row.invalidWordRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center text-muted-foreground">
            Play a game of Wordle to populate the leaderboard.
          </div>
        )}
      </section>

      <p className="text-xs leading-5 text-muted-foreground">
        Cost estimates use standard public API token prices and exclude caching, free tiers, and negotiated rates.
        Time per guess includes accepted and invalid attempts. Forfeited and abandoned boards are excluded
        per player, so the model boards from a game a human quit still count.
      </p>
    </div>
  );
}

function percent(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return "—";
  return milliseconds < 1000 ? `${Math.round(milliseconds)}ms` : `${(milliseconds / 1000).toFixed(2)}s`;
}

function formatCost(value: number | null): string {
  if (value === null) return "—";
  if (value < 0.001) return `$${value.toFixed(5)}`;
  return `$${value.toFixed(3)}`;
}
