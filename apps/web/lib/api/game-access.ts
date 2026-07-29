import type { LiveWordleGame } from "@/lib/arena/live-wordle";
import { getOrRehydrate } from "@/lib/arena/registry";
import { resolvePlayer, type ResolvedPlayer } from "@/lib/api/player";

export type GameAccess =
  | { ok: true; game: LiveWordleGame; player: ResolvedPlayer }
  | { ok: false; response: Response };

/**
 * Resolves the game and checks the caller owns its human seat.
 *
 * A missing cookie is a 401 and a cookie for someone else's game is a 403 — they
 * are different failures and a player who cleared their cookie deserves the
 * clearer one. Ownership is compared against the live game's in-memory
 * `humanPlayerId`, so the only round trip is the player lookup itself.
 */
export async function requireOwnedGame(request: Request, gameId: string): Promise<GameAccess> {
  const player = await resolvePlayer(request);
  if (!player) {
    return { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const game = await getOrRehydrate(gameId);
  if (!game) {
    return { ok: false, response: Response.json({ error: "not_found" }, { status: 404 }) };
  }

  if (game.humanPlayerId !== player.player.id) {
    return { ok: false, response: Response.json({ error: "forbidden" }, { status: 403 }) };
  }

  return { ok: true, game, player };
}
