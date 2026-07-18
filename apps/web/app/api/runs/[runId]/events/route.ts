import { apiError, participantToken, repository, tokenHash } from "@/lib/api/repository";
import { eventVisibility, visibleEvents } from "@/lib/api/events";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const after = Math.max(0, Number(new URL(request.url).searchParams.get("after") ?? 0) || 0);
  try {
    const repo = repository();
    const run = await repo.getRun(runId);
    if (!run) return Response.json({ error: "not_found" }, { status: 404 });
    const token = participantToken(request);
    const viewer = token ? await repo.getParticipant(runId, tokenHash(token)) : null;
    const allEvents = await repo.listEvents(runId);
    const visibility = eventVisibility(allEvents, run.status);
    const reset = visibility !== "live" && after > 0;
    const events = visibleEvents(allEvents, run.status, viewer?.seatId)
      .filter((event) => reset || event.sequence > after);
    return Response.json({ events, cursor: events.at(-1)?.sequence ?? after,
      visibility, reset });
  } catch (error) { return apiError(error); }
}
