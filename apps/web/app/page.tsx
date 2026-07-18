import { gameViews } from "@/games/registry";

export default function HomePage() {
  return (
    <main>
      <header>
        <p className="eyebrow">Architecture wireframe</p>
        <h1>AI Ramp Games</h1>
        <p className="lede">The workspace is connected. Gameplay and run services are ready for teammate implementation.</p>
      </header>

      <section aria-labelledby="games-title">
        <h2 id="games-title">Game modules</h2>
        <div className="game-grid">
          {gameViews.map((game) => (
            <article key={game.id}>
              <div>
                <p className="eyebrow">{game.status}</p>
                <h3>{game.label}</h3>
              </div>
              <p>{game.summary}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
