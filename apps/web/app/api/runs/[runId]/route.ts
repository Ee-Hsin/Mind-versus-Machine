import { notImplemented } from "@/lib/api/not-implemented";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  return notImplemented(`Run snapshot for ${runId}`);
}
