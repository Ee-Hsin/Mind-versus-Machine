import { createPlayRunRequestSchema, type RunConfig } from "@ai-ramp/protocol";
import { apiError, newParticipantToken, participantCookie, repository, tokenHash } from "@/lib/api/repository";
import { readJson } from "@/lib/api/json";

export const runtime = "nodejs";

export async function GET() {
  try { return Response.json({ runs: await repository().listRuns(50) }); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  const parsed = createPlayRunRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return Response.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  const enabled = new Set((process.env.ARENA_MODELS ?? "").split(",").map((id) => id.trim()).filter(Boolean));
  if (parsed.data.modelIds.some((id) => !enabled.has(id))) {
    return Response.json({ error: "unknown_model" }, { status: 400 });
  }
  const config: RunConfig = {
    gameType: parsed.data.gameType,
    mode: "play",
    gameConfig: parsed.data.gameType === "codenames" ? { hostRole: parsed.data.hostRole } : {},
    models: parsed.data.modelIds.map((id) => ({ id, displayName: id.split(":").at(-1) ?? id })),
    matches: 1, concurrency: 1,
  };
  try {
    const repo = repository();
    const run = await repo.createRun(config, "lobby");
    const roomCode = parsed.data.gameType === "codenames" ? crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase() : undefined;
    if (roomCode) await repo.setRoomCode(run.id, roomCode);
    const token = newParticipantToken();
    const seatId = parsed.data.gameType === "wordle"
      ? "human-wordle"
      : parsed.data.gameType === "imposter"
        ? "P1"
        : `red-${parsed.data.hostRole}`;
    const participant = await repo.createParticipant({ runId: run.id, tokenHash: tokenHash(token),
      displayName: parsed.data.displayName, seatId, isHost: true });
    return Response.json({ run, participant, roomCode }, { status: 201,
      headers: { "Set-Cookie": participantCookie(token) } });
  } catch (error) { return apiError(error); }
}
