import { createWordleGameRequestSchema, type ModelRef } from "@ai-ramp/protocol";
import { readJson } from "@/lib/api/json";
import { ensurePlayer, jsonWithPlayer } from "@/lib/api/player";
import { apiError, badRequest, repository } from "@/lib/api/repository";
import { LiveWordleGame, pickWordleAnswer } from "@/lib/arena/live-wordle";
import { AtCapacityError, admit, getOrRehydrate, register } from "@/lib/arena/registry";

export const runtime = "nodejs";

/**
 * Creates a Wordle game and starts the model boards immediately.
 *
 * The response deliberately does not contain the answer. The client validates
 * words against the public allowed-guess list for instant "not a word" feedback
 * and gets its colours from the server — which keeps the answer out of the
 * browser, and therefore keeps the human leaderboard meaningful.
 */
export async function POST(request: Request) {
  const parsed = createWordleGameRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return badRequest("invalid_request", parsed.error.flatten());

  const enabled = new Set(
    (process.env.ARENA_MODELS ?? "").split(",").map((id) => id.trim()).filter(Boolean),
  );
  // De-duplicate: seat ids are the model id, so the same model twice would
  // collide on the (game_id, seat_id) unique constraint.
  const modelIds = [...new Set(parsed.data.modelIds)];
  if (modelIds.some((id) => !enabled.has(id))) return badRequest("unknown_model");
  if (modelIds.length === 0) return badRequest("no_models_selected");

  try {
    const repo = repository();
    const { player, cookie } = await ensurePlayer(request, parsed.data.displayName);

    // One game at a time: finishing or quitting is what frees the slot.
    const active = await repo.findActiveGame(player.id, "wordle");
    if (active) {
      const resident = await getOrRehydrate(active.id);
      return jsonWithPlayer(
        { error: "game_in_progress", gameId: active.id, snapshot: resident?.snapshot() ?? null },
        cookie,
        { status: 409 },
      );
    }

    admit();

    const models: ModelRef[] = modelIds.map((id) => ({
      id,
      displayName: id.split(":").at(-1) ?? id,
    }));
    const answer = pickWordleAnswer();
    const game = await repo.createWordleGame({
      playerId: player.id,
      displayName: player.displayName,
      answer,
      models,
    });
    const participants = await repo.listParticipants(game.id);
    const live = LiveWordleGame.start({ game, answer, participants, models });
    register(live);

    return jsonWithPlayer({ gameId: game.id, snapshot: live.snapshot() }, cookie, { status: 201 });
  } catch (error) {
    if (error instanceof AtCapacityError) {
      return Response.json({ error: "at_capacity", message: error.message }, { status: 503 });
    }
    return apiError(error);
  }
}
