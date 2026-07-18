import { runAdapter, type GameDefinition } from "@ai-ramp/engine";
import { WordleAdapter } from "./adapter";
import { WordleModel } from "./model";

export const wordleDefinition: GameDefinition<"wordle"> = {
  gameType: "wordle",
  async runMatch(context) {
    const seeded = new WordleModel();
    const { answer } = seeded.serialize();
    const outcomes = await Promise.all(Object.entries(context.players).map(async ([actorId, player]) => {
      const adapter = new WordleAdapter(actorId, new WordleModel({ answer, guesses: [] }));
      const run = await runAdapter(adapter, { [actorId]: player }, {
        signal: context.signal,
        observer: {
          async onTurn(turn) {
            const state = adapter.publicStateFor();
            const common = {
              playerId: actorId,
              accepted: turn.accepted,
              attempt: turn.attempt,
              latencyMs: turn.latencyMs,
              inputTokens: turn.inputTokens,
              outputTokens: turn.outputTokens,
            };

            if (actorId !== "human-wordle") {
              await context.events.publish({
                sequence: 0, runId: context.runId, gameType: "wordle", type: "turn",
                timestamp: new Date().toISOString(), audience: { kind: "public" },
                matchId: String(context.matchNumber), gameId: actorId,
                payload: {
                  ...common,
                  action: null,
                  revealed: false,
                  state: {
                    board: state.board.map((row) => ({ guess: "", states: row.states })),
                    guessesMade: state.guessesMade,
                    triesRemaining: state.triesRemaining,
                    isWon: state.isWon,
                    isGameOver: state.isGameOver,
                  },
                },
              });
              await context.events.publish({
                sequence: 0, runId: context.runId, gameType: "wordle", type: "turn_reveal",
                timestamp: new Date().toISOString(), audience: { kind: "postgame" },
                matchId: String(context.matchNumber), gameId: actorId,
                payload: { ...common, action: turn.action, revealed: true, state },
              });
              return;
            }

            await context.events.publish({
              sequence: 0, runId: context.runId, gameType: "wordle", type: "turn",
              timestamp: new Date().toISOString(), audience: { kind: "public" },
              matchId: String(context.matchNumber), gameId: actorId,
              payload: { ...common, action: turn.action, revealed: true, state },
            });
          },
        },
      });
      const metric = {
        actorId, score: run.result.scores[actorId] ?? 0, won: (run.result.scores[actorId] ?? 0) > 0,
        guesses: adapter.serialize().guesses.length,
        invalidActions: run.turns.filter((turn) => !turn.accepted).length,
        latencyMs: run.turns.reduce((sum, turn) => sum + turn.latencyMs, 0),
        inputTokens: run.inputTokens, outputTokens: run.outputTokens,
      };
      return {
        metric,
        game: { gameId: actorId, result: run.result, finalState: run.finalState },
      };
    }));
    const metrics = outcomes.map(({ metric }) => metric);
    const games = outcomes.map(({ game }) => game);
    await context.events.publish({
      sequence: 0, runId: context.runId, gameType: "wordle", type: "match_completed",
      timestamp: new Date().toISOString(), audience: { kind: "postgame" },
      matchId: String(context.matchNumber), payload: { metrics, games },
    });
    return { metrics };
  },
};
