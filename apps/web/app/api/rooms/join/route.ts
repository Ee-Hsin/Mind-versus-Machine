import { joinRoomRequestSchema } from "@ai-ramp/protocol";
import { apiError, newParticipantToken, participantCookie, repository, tokenHash } from "@/lib/api/repository";
import { readJson } from "@/lib/api/json";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = joinRoomRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return Response.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  try {
    const repo = repository();
    const run = await repo.findRunByRoomCode(parsed.data.roomCode);
    if (!run || run.config.gameType !== "codenames") return Response.json({ error: "room_not_found" }, { status: 404 });
    const participants = await repo.listParticipants(run.id);
    const seatId = participants.some((p) => p.seatId === "red-spymaster") ? "red-operative" : "red-spymaster";
    if (participants.some((p) => p.seatId === seatId)) return Response.json({ error: "room_full" }, { status: 409 });
    const token = newParticipantToken();
    const participant = await repo.createParticipant({ runId: run.id, tokenHash: tokenHash(token),
      displayName: parsed.data.displayName, seatId, isHost: false });
    return Response.json({ run, participant }, { status: 201, headers: { "Set-Cookie": participantCookie(token) } });
  } catch (error) { return apiError(error); }
}
