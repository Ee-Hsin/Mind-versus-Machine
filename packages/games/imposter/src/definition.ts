import { runAdapter, type GameDefinition } from "@ai-ramp/engine";
import { IMPOSTER_SEATS, type ImposterAlignment } from "@ai-ramp/protocol";
import { ImposterAdapter } from "./adapter";
import { ImposterModel } from "./model";

export const imposterDefinition: GameDefinition<"imposter"> = {
  gameType: "imposter",
  async runMatch(context) {
    // Benchmark: one random game with each of the six models on a seat (P1..P6).
    const model = new ImposterModel();
    const adapter = new ImposterAdapter(model);
    const run = await runAdapter(adapter, context.players, { signal: context.signal });

    const scores = adapter.result().scores;
    const imposter = model.imposterSeat;
    const metrics = IMPOSTER_SEATS.map((seat) => {
      const relevant = run.turns.filter((turn) => turn.playerId === seat);
      const role: ImposterAlignment = seat === imposter ? "imposter" : "crew";
      return {
        actorId: context.players[seat]?.id ?? seat,
        seat,
        role,
        won: scores[seat] === 1,
        score: scores[seat] ?? 0,
        invalidActions: relevant.filter((turn) => !turn.accepted).length,
        latencyMs: relevant.reduce((sum, turn) => sum + turn.latencyMs, 0),
        inputTokens: relevant.reduce((sum, turn) => sum + turn.inputTokens, 0),
        outputTokens: relevant.reduce((sum, turn) => sum + turn.outputTokens, 0),
      };
    });
    await context.events.publish({
      sequence: 0, runId: context.runId, gameType: "imposter", type: "match_completed",
      timestamp: new Date().toISOString(), audience: { kind: "postgame" },
      matchId: String(context.matchNumber), payload: {
        metrics,
        games: [{ gameId: `imposter-${context.matchNumber}`, result: adapter.result(), finalState: model.serialize() }],
      },
    });
    return { metrics };
  },
};
