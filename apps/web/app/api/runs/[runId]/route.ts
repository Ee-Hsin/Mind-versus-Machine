import { apiError, participantToken, repository, tokenHash } from "@/lib/api/repository";
import { eventVisibility, visibleEvents } from "@/lib/api/events";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  try {
    const repo = repository();
    const run = await repo.getRun(runId);
    if (!run) return Response.json({ error: "not_found" }, { status: 404 });
    const allEvents = await repo.listEvents(runId);
    const terminal = ["completed", "failed", "cancelled"].includes(run.status);
    const replays = terminal ? await repo.listReplays(runId) : [];
    const token = participantToken(request);
    const participants = await repo.listParticipants(runId);
    const viewer = token ? await repo.getParticipant(runId, tokenHash(token)) : null;
    const events = visibleEvents(allEvents, run.status, viewer?.seatId);
    const pending = token ? await repo.pendingTurnFor(runId, tokenHash(token)) : null;
    const pendingTurn = pending ? {
      turnId: pending.id,
      gameId: pending.gameId,
      turnNumber: pending.turnNumber,
      seatId: pending.seatId,
    } : null;
    // The room code is only shared with participants (they invite the other seat).
    const roomCode = viewer ? await repo.roomCodeFor(runId) : null;
    return Response.json({ run, events, replays, viewer,
      room: participants.length
        ? { code: roomCode ?? undefined, participants, ready: participants.length > 0 && participants.every((p) => p.ready) }
        : null,
      pendingTurn,
      visibility: eventVisibility(allEvents, run.status) });
  } catch (error) { return apiError(error); }
}
