import type { GameAdapter } from "../adapters/types";
import type { GameLogger } from "../db/logger";
import type { Player } from "../llm/player";

const MAX_ATTEMPTS_PER_TURN = 3;

export interface RunGameResult {
  gameId: string;
  abandoned: boolean;
  inputTokens: number;
  outputTokens: number;
}

export async function runGame(
  adapter: GameAdapter,
  players: Record<string, Player>,
  logger: GameLogger,
  matchId: string | null = null,
): Promise<RunGameResult> {
  const gameId = await logger.startGame({
    game_type: adapter.gameType,
    player: Object.values(players).map(({ name }) => name).join(" vs "),
    match_id: matchId,
  });
  let turnNumber = 0;
  let abandoned = false;
  let inputTokens = 0;
  let outputTokens = 0;

  outer: while (!adapter.isOver()) {
    for (const playerId of adapter.playersToAct()) {
      const player = players[playerId];
      if (!player) throw new Error(`No player registered for game player "${playerId}".`);
      turnNumber++;
      let rejection: string | null = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_TURN; attempt++) {
        const prompt = adapter.viewFor(playerId) +
          (rejection ? `\n\nYour previous action was invalid: ${rejection}` : "");
        const outcome = await player.act(adapter.systemPromptFor(playerId), prompt, adapter.actionSchema);
        inputTokens += outcome.inputTokens ?? 0;
        outputTokens += outcome.outputTokens ?? 0;
        const parsed = adapter.actionSchema.safeParse(outcome.action);
        const result = parsed.success
          ? adapter.applyAction(playerId, parsed.data)
          : { accepted: false, message: "Output did not match the action schema." };
        await logger.logTurn({
          game_id: gameId,
          turn_number: turnNumber,
          player: player.name,
          prompt,
          raw_output: outcome.action,
          action: parsed.success ? parsed.data : null,
          accepted: result.accepted,
          attempt,
          latency_ms: outcome.latencyMs,
          input_tokens: outcome.inputTokens,
          output_tokens: outcome.outputTokens,
        });
        if (result.accepted) break;
        rejection = result.message ?? "Invalid action.";
        if (attempt === MAX_ATTEMPTS_PER_TURN) {
          abandoned = true;
          break outer;
        }
      }
    }
  }

  const result = abandoned
    ? { scores: {}, summary: `Abandoned after ${MAX_ATTEMPTS_PER_TURN} invalid attempts.` }
    : adapter.result();
  await logger.finishGame(gameId, result, adapter.serialize());
  return { gameId, abandoned, inputTokens, outputTokens };
}
