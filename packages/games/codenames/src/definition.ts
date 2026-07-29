import { runAdapter, type GameDefinition } from "@ai-ramp/engine";
import type { ArenaEventAudience } from "@ai-ramp/protocol";
import { CodenamesAdapter } from "./adapter";
import { CodenamesModel } from "./model";

const RED_SPYMASTER_SEAT = "red-spymaster";

export const codenamesDefinition: GameDefinition<"codenames"> = {
  gameType: "codenames",
  async runMatch(context) {
    const model = new CodenamesModel();
    const adapter = new CodenamesAdapter(model);
    const publish = (type: string, audience: ArenaEventAudience, payload: unknown) =>
      context.events.publish({
        gameId: context.gameId,
        gameType: "codenames",
        type,
        timestamp: new Date().toISOString(),
        audience,
        payload,
      });

    // Deal the board before anyone acts: a public snapshot (masked colours) so
    // both humans can see the words immediately, and a seat-scoped key that only
    // the human red spymaster's snapshot will ever return.
    await publish("state", { kind: "public" }, { state: adapter.publicStateFor("spectator") });
    const { words, colors } = model.fullBoard();
    await publish("key", { kind: "seat", seatId: RED_SPYMASTER_SEAT }, { words, colors });

    const run = await runAdapter(adapter, context.players, {
      signal: context.signal,
      observer: {
        async onTurn(turn) {
          await publish("turn", { kind: "public" }, {
            playerId: turn.playerId,
            action: turn.accepted ? turn.action : null,
            accepted: turn.accepted,
            attempt: turn.attempt,
            latencyMs: turn.latencyMs,
            inputTokens: turn.inputTokens,
            outputTokens: turn.outputTokens,
            state: adapter.publicStateFor("spectator"),
          });
        },
      },
    });

    const winner = adapter.result().scores;
    const metrics = (["red", "blue"] as const).map((team) => {
      const relevant = run.turns.filter((turn) => turn.playerId.startsWith(`${team}-`));
      return {
        actorId: context.players[`${team}-spymaster`]?.id ?? team,
        team, won: winner[team] === 1, score: winner[team] ?? 0,
        clues: relevant.filter((turn) => (turn.action as { type?: string } | null)?.type === "clue" && turn.accepted).length,
        guesses: relevant.filter((turn) => (turn.action as { type?: string } | null)?.type === "guess" && turn.accepted).length,
        invalidActions: relevant.filter((turn) => !turn.accepted).length,
        latencyMs: relevant.reduce((sum, turn) => sum + turn.latencyMs, 0),
        inputTokens: relevant.reduce((sum, turn) => sum + turn.inputTokens, 0),
        outputTokens: relevant.reduce((sum, turn) => sum + turn.outputTokens, 0),
      };
    });
    await publish("match_completed", { kind: "postgame" }, {
      metrics,
      // finalState carries the full key so a completed game can flip every card
      // for the operative and spectators.
      games: [{ gameId: `codenames-${context.gameId}`, result: run.result, finalState: run.finalState }],
    });
    return { metrics };
  },
};
