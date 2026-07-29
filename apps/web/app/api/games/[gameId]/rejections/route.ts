import { reportWordleRejectionRequestSchema } from "@ai-ramp/protocol";
import { requireOwnedGame } from "@/lib/api/game-access";
import { readJson } from "@/lib/api/json";
import { apiError, badRequest } from "@/lib/api/repository";

export const runtime = "nodejs";

/**
 * Records a word the client rejected locally against the allowed-guess list.
 *
 * Purely telemetry, and the reason it exists is leaderboard fairness: the valid
 * word rate is 10% of the Wordle score, and without this humans would post a
 * perfect rate simply because their bad guesses never reach the server, while
 * every model is scored on theirs.
 *
 * Fire-and-forget — the client does not wait on it and nothing about play
 * depends on it landing.
 */
export async function POST(request: Request, context: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  const parsed = reportWordleRejectionRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return badRequest("invalid_request", parsed.error.flatten());

  try {
    const access = await requireOwnedGame(request, gameId);
    if (!access.ok) return access.response;
    access.game.recordRejection(parsed.data.guess);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
