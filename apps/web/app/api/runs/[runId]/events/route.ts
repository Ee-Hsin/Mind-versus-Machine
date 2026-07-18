import { apiError, repository } from "@/lib/api/repository";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const after = Math.max(0, Number(new URL(request.url).searchParams.get("after") ?? 0) || 0);
  try {
    const repo = repository();
    const run = await repo.getRun(runId);
    if (!run) return Response.json({ error: "not_found" }, { status: 404 });
    const terminal = ["completed", "failed", "cancelled"].includes(run.status);
    const reset = terminal && after > 0;
    const events = (await repo.listEvents(runId, reset ? 0 : after)).filter((event) =>
      event.audience.kind === "public" || (terminal && event.audience.kind === "postgame"));
    return Response.json({ events, cursor: events.at(-1)?.sequence ?? after,
      visibility: terminal ? "terminal" : "live", reset });
  } catch (error) { return apiError(error); }
}
