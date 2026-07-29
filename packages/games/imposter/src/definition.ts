import { runAdapter, type GameDefinition } from "@ai-ramp/engine";
import { IMPOSTER_SEATS, type ImposterAlignment } from "@ai-ramp/protocol";
import { ImposterAdapter } from "./adapter";
import { ImposterModel } from "./model";

export const imposterDefinition: GameDefinition<"imposter"> = {
  gameType: "imposter",
  async runMatch(context) {
    const model = new ImposterModel();
    const adapter = new ImposterAdapter(model);
    const timestamp = () => new Date().toISOString();

    await context.events.publish({
      gameId: context.gameId,
      gameType: "imposter",
      type: "match_started",
      timestamp: timestamp(),
      audience: { kind: "public" },
      payload: { state: adapter.publicStateFor("spectator") },
    });
    if (context.humanSeats.includes("P1")) {
      await context.events.publish({
        gameId: context.gameId,
        gameType: "imposter",
        type: "seat_state",
        timestamp: timestamp(),
        audience: { kind: "seat", seatId: "P1" },
        seatId: "P1",
        payload: { state: adapter.publicStateFor("P1") },
      });
    }

    const run = await runAdapter(adapter, context.players, {
      signal: context.signal,
      observer: {
        async onTurn(turn) {
          const common = {
            playerId: turn.playerId,
            accepted: turn.accepted,
            attempt: turn.attempt,
            latencyMs: turn.latencyMs,
            inputTokens: turn.inputTokens,
            outputTokens: turn.outputTokens,
          };
          await context.events.publish({
            gameId: context.gameId,
            gameType: "imposter",
            type: "turn",
            timestamp: timestamp(),
            audience: { kind: "public" },
            payload: { ...common, state: adapter.publicStateFor("spectator") },
          });
          if (context.humanSeats.includes("P1")) {
            await context.events.publish({
              gameId: context.gameId,
              gameType: "imposter",
              type: "seat_state",
              timestamp: timestamp(),
              audience: { kind: "seat", seatId: "P1" },
              seatId: "P1",
              payload: { ...common, state: adapter.publicStateFor("P1") },
            });
          }
        },
      },
    });

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
      gameId: context.gameId,
      gameType: "imposter",
      type: "match_completed",
      timestamp: timestamp(),
      audience: { kind: "postgame" },
      payload: {
        metrics,
        games: [{ gameId: `imposter-${context.gameId}`, result: run.result, finalState: run.finalState }],
      },
    });
    return { metrics };
  },
};
