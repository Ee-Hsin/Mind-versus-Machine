import { runAdapter, type GameDefinition } from "@ai-ramp/engine";
import { WordleAdapter } from "./adapter";
import { WordleModel } from "./model";

export const wordleDefinition: GameDefinition<"wordle"> = {
  gameType: "wordle",
  async runMatch(context) {
    const metrics = [];
    const seeded = new WordleModel();
    const { answer } = seeded.serialize();
    for (const [actorId, player] of Object.entries(context.players)) {
      const adapter = new WordleAdapter(actorId, new WordleModel({ answer, guesses: [] }));
      const run = await runAdapter(adapter, { [actorId]: player }, { signal: context.signal });
      metrics.push({
        actorId, score: run.result.scores[actorId] ?? 0, won: (run.result.scores[actorId] ?? 0) > 0,
        guesses: adapter.serialize().guesses.length,
        invalidActions: run.turns.filter((turn) => !turn.accepted).length,
        latencyMs: run.turns.reduce((sum, turn) => sum + turn.latencyMs, 0),
        inputTokens: run.inputTokens, outputTokens: run.outputTokens,
      });
    }
    return { metrics };
  },
};
