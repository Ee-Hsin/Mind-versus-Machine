import { runAdapter, type GameDefinition } from "@ai-ramp/engine";
import type { WordleLetterState, WordleTurnEventPayload } from "@ai-ramp/protocol";
import { WordleAdapter } from "./adapter";
import { WordleModel } from "./model";

/**
 * Runs the model boards for one Wordle game. Every seat handed to this
 * definition is a model — the human's board is driven directly by HTTP requests
 * in the live layer, because a human guess is request/response rather than a
 * turn loop.
 *
 * Boards race in parallel on the same answer, and each `turn` event carries the
 * canonical guess. Concealing letters from a live spectator is the projection
 * layer's job, not this one's, so there is exactly one place that decides it.
 */
export const wordleDefinition: GameDefinition<"wordle"> = {
  gameType: "wordle",
  async runMatch(context) {
    const { answer } = context.config;
    const timestamp = () => new Date().toISOString();

    const outcomes = await Promise.all(
      Object.entries(context.players).map(async ([seatId, player]) => {
        const adapter = new WordleAdapter(seatId, new WordleModel({ answer, guesses: [] }));
        const run = await runAdapter(adapter, { [seatId]: player }, {
          signal: context.signal,
          observer: {
            async onTurn(turn) {
              const state = adapter.publicStateFor();
              const guess = (turn.action as { guess?: string } | null)?.guess ?? "";
              const row = turn.accepted ? state.board.at(-1) : undefined;
              const payload: WordleTurnEventPayload = {
                seatId,
                guess: (row?.guess ?? guess).toUpperCase(),
                states: (row?.states ?? []) as WordleLetterState[],
                accepted: turn.accepted,
                attempt: turn.attempt,
                latencyMs: turn.latencyMs,
                inputTokens: turn.inputTokens,
                outputTokens: turn.outputTokens,
                guessesMade: state.guessesMade,
                triesRemaining: state.triesRemaining,
                isWon: state.isWon,
                isGameOver: state.isGameOver,
              };
              await context.events.publish({
                gameId: context.gameId,
                gameType: "wordle",
                type: "turn",
                seatId,
                timestamp: timestamp(),
                audience: { kind: "postgame" },
                payload,
              });
            },
          },
        });

        return {
          actorId: seatId,
          score: run.result.scores[seatId] ?? 0,
          won: (run.result.scores[seatId] ?? 0) > 0,
          guesses: adapter.serialize().guesses.length,
          invalidActions: run.turns.filter((turn) => !turn.accepted).length,
          latencyMs: run.turns.reduce((sum, turn) => sum + turn.latencyMs, 0),
          inputTokens: run.inputTokens,
          outputTokens: run.outputTokens,
        };
      }),
    );

    return { metrics: outcomes };
  },
};
