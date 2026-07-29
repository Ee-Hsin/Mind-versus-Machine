import Link from "next/link";
import { cn } from "@/lib/utils";

// Only games with a live leaderboard. Codenames and Imposter return here once
// they are ported onto the live-play stack.
const games = [
  { id: "wordle", label: "Wordle" },
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
