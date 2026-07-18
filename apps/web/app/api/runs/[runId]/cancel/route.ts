import { apiError, repository } from "@/lib/api/repository";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  try {
    const repo = repository();
    if (!(await repo.getRun(runId))) return Response.json({ error: "not_found" }, { status: 404 });
    await repo.requestCancellation(runId);
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
