import { apiError, participantToken, repository, tokenHash } from "@/lib/api/repository";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const token = participantToken(request);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const repo = repository();
    const run = await repo.getRun(runId);
    if (!run) return Response.json({ error: "not_found" }, { status: 404 });
    if (run.status !== "lobby") return Response.json({ error: "invalid_status", status: run.status }, { status: 409 });
    await repo.setParticipantReady(runId, tokenHash(token));
    const participants = await repo.listParticipants(runId);
    const required = run.config.gameType === "codenames" ? 2 : 1;
    if (participants.length >= required && participants.every((participant) => participant.ready)) await repo.queueRun(runId);
    return Response.json({ ok: true, queued: participants.length >= required && participants.every((participant) => participant.ready) });
  } catch (error) { return apiError(error); }
}
