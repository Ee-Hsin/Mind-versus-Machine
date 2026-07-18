import { runAdapter, type GameDefinition } from "@ai-ramp/engine";
import { CodenamesAdapter } from "./adapter";
import { CodenamesModel } from "./model";

export const codenamesDefinition: GameDefinition<"codenames"> = {
  gameType: "codenames",
  async runMatch(context) {
    const adapter = new CodenamesAdapter(new CodenamesModel());
    const run = await runAdapter(adapter, context.players, { signal: context.signal });
    const winner = adapter.result().scores;
    const metrics = (["red", "blue"] as const).map((team) => {
      const relevant = run.turns.filter((turn) => turn.playerId.startsWith(`${team}-`));
      return {
        actorId: team, team, won: winner[team] === 1, score: winner[team] ?? 0,
        clues: relevant.filter((turn) => (turn.action as { type?: string } | null)?.type === "clue" && turn.accepted).length,
        guesses: relevant.filter((turn) => (turn.action as { type?: string } | null)?.type === "guess" && turn.accepted).length,
        invalidActions: relevant.filter((turn) => !turn.accepted).length,
        latencyMs: relevant.reduce((sum, turn) => sum + turn.latencyMs, 0),
        inputTokens: relevant.reduce((sum, turn) => sum + turn.inputTokens, 0),
        outputTokens: relevant.reduce((sum, turn) => sum + turn.outputTokens, 0),
      };
    });
    return { metrics };
  },
};
