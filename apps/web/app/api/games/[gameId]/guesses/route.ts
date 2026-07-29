import { submitWordleGuessRequestSchema } from "@ai-ramp/protocol";
import { requireOwnedGame } from "@/lib/api/game-access";
import { readJson } from "@/lib/api/json";
import { jsonWithPlayer } from "@/lib/api/player";
import { apiError, badRequest } from "@/lib/api/repository";

export const runtime = "nodejs";

/**
 * Scores one human guess.
 *
 * The result comes back on this response rather than over the stream: it is a
 * direct request/response, so this is both the lowest-latency path and avoids
 * the client having to correlate its own guess back off a broadcast. Scoring is
 * in-memory, and the durable write is queued behind the response.
 *
 * The server is authoritative even though the client also renders optimistically
 * — the client only knows word-list membership, never the answer.
 */
export async function POST(request: Request, context: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  const parsed = submitWordleGuessRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return badRequest("invalid_request", parsed.error.flatten());

  try {
    const access = await requireOwnedGame(request, gameId);
    if (!access.ok) return access.response;

    const result = await access.game.submitGuess(parsed.data.guess, parsed.data.expectedTurn);
    return jsonWithPlayer({ result }, access.player.cookie);
  } catch (error) {
    return apiError(error);
  }
}
