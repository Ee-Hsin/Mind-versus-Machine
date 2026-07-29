import { jsonWithPlayer, resolvePlayer } from "@/lib/api/player";
import { apiError, repository } from "@/lib/api/repository";
import { getOrRehydrate } from "@/lib/arena/registry";

export const runtime = "nodejs";

/**
 * The caller's unfinished Wordle game, if they have one. Lets the launch dialog
 * offer "resume" instead of failing the create with a 409.
 */
export async function GET(request: Request) {
  try {
    const player = await resolvePlayer(request);
    if (!player) return Response.json({ game: null });

    const active = await repository().findActiveGame(player.player.id, "wordle");
    if (!active) return jsonWithPlayer({ game: null }, player.cookie);

    const live = await getOrRehydrate(active.id);
    return jsonWithPlayer(
      { game: { gameId: active.id, expiresAt: active.expiresAt, snapshot: live?.snapshot() ?? null } },
      player.cookie,
    );
  } catch (error) {
    return apiError(error);
  }
}
