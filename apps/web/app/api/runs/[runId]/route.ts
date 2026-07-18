import { apiError, participantToken, repository, tokenHash } from "@/lib/api/repository";
import type { ArenaEvent } from "@ai-ramp/protocol";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  try {
    const repo = repository();
    const run = await repo.getRun(runId);
    if (!run) return Response.json({ error: "not_found" }, { status: 404 });
    const events = visibleEvents(await repo.listEvents(runId), run.status);
    const token = participantToken(request);
    const participants = await repo.listParticipants(runId);
    const viewer = token ? await repo.getParticipant(runId, tokenHash(token)) : null;
    const pendingTurn = token ? await repo.pendingTurnFor(runId, tokenHash(token)) : null;
    return Response.json({ run, events, viewer,
      room: participants.length ? { participants, ready: participants.length > 0 && participants.every((p) => p.ready) } : null,
      pendingTurn,
      visibility: ["completed", "failed", "cancelled"].includes(run.status) ? "terminal" : "live" });
  } catch (error) { return apiError(error); }
}

function visibleEvents(events: ArenaEvent[], status: string) {
  const terminal = ["completed", "failed", "cancelled"].includes(status);
  return events.filter((event) => event.audience.kind === "public" || (terminal && event.audience.kind === "postgame"));
}
