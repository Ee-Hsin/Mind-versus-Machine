import { z } from "zod";
import { readJson } from "@/lib/api/json";
import { listConfiguredModels } from "@/lib/openrouter";
import { createGame, WORDLE_MODEL_LIMIT } from "@/lib/wordle/game-store";

export const runtime = "nodejs";

const createGameSchema = z.object({
  modelIds: z.array(z.string().min(1)).min(1).max(WORDLE_MODEL_LIMIT),
});

export async function POST(request: Request) {
  const parsed = createGameSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const configured = new Map(listConfiguredModels().map((model) => [model.id, model]));
  const modelIds = [...new Set(parsed.data.modelIds)];
  if (modelIds.length === 0) {
    return Response.json({ error: "no_models_selected" }, { status: 400 });
  }
  if (modelIds.some((id) => !configured.has(id))) {
    return Response.json({ error: "unknown_model" }, { status: 400 });
  }

  const snapshot = createGame(modelIds.map((id) => configured.get(id)!));
  return Response.json({ gameId: snapshot.gameId, snapshot }, { status: 201 });
}
