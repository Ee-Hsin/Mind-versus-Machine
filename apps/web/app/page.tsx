import { GameDialog } from "@/components/game-dialog";
import { gameViews } from "@/games/registry";

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 py-12 sm:py-20">
      <header className="mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
        <h1 className="font-heading text-5xl leading-none font-semibold sm:text-6xl">AI Ramp Games</h1>
        <div className="flex flex-col gap-1.5 text-base leading-6 text-muted-foreground">
          <p>Play familiar games against leading AI models.</p>
          <p id="evaluation">Every match doubles as a lightweight, transparent evaluation.</p>
        </div>
      </header>

      <section id="games" aria-labelledby="games-title">
        <h2 className="sr-only" id="games-title">
          Game modes
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {gameViews.map((game) => (
            <GameDialog game={game} key={game.id} />
          ))}
        </div>
      </section>
    </div>
  );
}
