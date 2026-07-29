import { isTerminalStatus } from "@ai-ramp/protocol";
import { requireOwnedGame } from "@/lib/api/game-access";
import { jsonWithPlayer } from "@/lib/api/player";
import { apiError, repository } from "@/lib/api/repository";

export const runtime = "nodejs";

/**
 * Quitting.
 *
 * Idempotent, because a Quit button gets double-clicked: an already-terminal game
 * returns its current state rather than erroring.
 *
 * The model boards are deliberately left running. By the time anyone quits they
 * are almost always finished already — models take ~15s, humans take minutes —
 * and aborting a board four guesses in would throw away tokens already spent for
 * a result that can no longer be scored. Their outcomes land as normal and still
 * count; only the human participant is excluded from human stats.
 *
 * The game flips to `forfeited` immediately rather than waiting on the models, so
 * the player can start a new game right away.
 */
export async function POST(request: Request, context: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  try {
    const access = await requireOwnedGame(request, gameId);
    if (!access.ok) return access.response;

    const { game, player } = access;
    if (isTerminalStatus(game.status)) {
      return jsonWithPlayer({ snapshot: game.snapshot() }, player.cookie);
    }

    await repository().forfeitGame(gameId, player.player.id);
    game.markForfeited();
    return jsonWithPlayer({ snapshot: game.snapshot() }, player.cookie);
  } catch (error) {
    return apiError(error);
  }
}
