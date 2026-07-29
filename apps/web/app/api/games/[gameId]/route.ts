import { jsonWithPlayer } from "@/lib/api/player";
import { requireOwnedGame } from "@/lib/api/game-access";
import { apiError } from "@/lib/api/repository";

export const runtime = "nodejs";

/**
 * The initial snapshot. The stream carries everything after this, so this route
 * is hit once per page load rather than on a poll — and it rehydrates an evicted
 * game, which is what makes resuming after a refresh or restart work.
 */
export async function GET(request: Request, context: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  try {
    const access = await requireOwnedGame(request, gameId);
    if (!access.ok) return access.response;
    return jsonWithPlayer({ snapshot: access.game.snapshot() }, access.player.cookie);
  } catch (error) {
    return apiError(error);
  }
}
