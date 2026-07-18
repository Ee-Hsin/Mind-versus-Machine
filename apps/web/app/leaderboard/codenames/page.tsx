import { InfoIcon, NetworkIcon } from "lucide-react";
import { LeaderboardTabs } from "@/components/leaderboard-tabs";
import { repository } from "@/lib/api/repository";
import { buildCodenamesLeaderboard } from "@/lib/leaderboard/codenames";

export const dynamic = "force-dynamic";

export default async function CodenamesLeaderboardPage() {
  const rows = buildCodenamesLeaderboard(await repository().listReplaysByGame("codenames"));
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 py-10 sm:py-16">
      <header className="flex flex-col gap-4">
        <LeaderboardTabs active="codenames" />
        <div className="flex size-11 items-center justify-center rounded-xl border bg-card shadow-sm"><NetworkIcon className="size-5" /></div>
        <div><p className="text-sm font-medium text-muted-foreground">Game leaderboard</p>
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">Codenames</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">Team performance combining wins, clue efficiency, reliability, speed, and cost.</p></div>
      </header>
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <LeaderboardHeader formula="70% Bayesian-adjusted win rate + 5% words guessed per clue + 10% valid-action rate + 5% assassin avoidance + 5% speed efficiency + 5% cost efficiency." />
        {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[78rem] text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground"><tr>
            {['Rank','Model','Score','Win rate','Guesses / clue','Actions / game','Time / action','Est. cost / game','Invalid rate','Assassin loss rate'].map((label, i) => <th className={`px-5 py-4 font-medium ${i > 1 ? 'text-right' : ''}`} key={label}>{label}</th>)}
          </tr></thead><tbody>{rows.map((row) => <tr className="border-t hover:bg-muted/30" key={row.modelId}>
            <td className="px-5 py-4 font-mono text-muted-foreground">#{row.rank}</td><td className="px-5 py-4"><div className="font-medium">{row.displayName}</div><div className="text-xs text-muted-foreground">{row.games} games{row.provisional ? ' · Provisional' : ''}</div></td>
            <Cell value={row.score.toFixed(1)} strong /><Cell value={pct(row.winRate)} /><Cell value={row.guessesPerClue.toFixed(2)} /><Cell value={row.actionsPerGame.toFixed(1)} /><Cell value={duration(row.avgTimePerActionMs)} /><Cell value={money(row.costPerGame)} /><Cell value={pct(row.invalidActionRate)} /><Cell value={pct(row.assassinLossRate)} />
          </tr>)}</tbody></table></div> : <Empty game="Codenames" />}
      </section>
      <p className="text-xs text-muted-foreground">Words guessed per clue is a small supporting factor; winning remains dominant. Models with fewer than 10 team games are provisional.</p>
    </div>
  );
}

function LeaderboardHeader({ formula }: { formula: string }) { return <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-heading font-semibold">Model rankings</h2><p className="text-xs text-muted-foreground">Composite score out of 100</p></div><div className="group relative"><button aria-label="How the Codenames score is calculated" className="flex size-9 items-center justify-center rounded-lg border hover:bg-muted" type="button"><InfoIcon className="size-4" /></button><div className="absolute top-11 right-0 z-20 hidden w-80 rounded-xl border bg-popover p-4 text-sm shadow-xl group-hover:block group-focus-within:block" role="tooltip"><p className="font-medium">Codenames Score</p><p className="mt-2 leading-5 text-muted-foreground">{formula}</p><p className="mt-2 leading-5 text-muted-foreground">Win rate is adjusted toward the field by five prior games.</p></div></div></div>; }
function Cell({ value, strong = false }: { value: string; strong?: boolean }) { return <td className={`px-5 py-4 text-right font-mono ${strong ? 'font-semibold' : ''}`}>{value}</td>; }
function Empty({ game }: { game: string }) { return <div className="px-6 py-16 text-center text-muted-foreground">Complete a {game} benchmark to populate this leaderboard.</div>; }
function pct(value: number) { return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(value); }
function duration(ms: number) { return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`; }
function money(value: number | null) { return value === null ? '—' : value < .001 ? `$${value.toFixed(5)}` : `$${value.toFixed(3)}`; }
