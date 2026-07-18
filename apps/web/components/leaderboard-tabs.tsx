import Link from "next/link";
import { cn } from "@/lib/utils";

const games = [
  { id: "wordle", label: "Wordle" },
  { id: "codenames", label: "Codenames" },
  { id: "imposter", label: "Imposter" },
] as const;

export function LeaderboardTabs({ active }: Readonly<{ active: string }>) {
  return (
    <nav aria-label="Game leaderboards" className="flex w-fit gap-1 rounded-xl border bg-card/70 p-1 shadow-sm">
      {games.map((game) => (
        <Link
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            active === game.id && "bg-muted text-foreground",
          )}
          href={`/leaderboard/${game.id}`}
          key={game.id}
        >
          {game.label}
        </Link>
      ))}
    </nav>
  );
}
