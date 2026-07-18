import { submitActionRequestSchema } from "@ai-ramp/protocol";
import { notImplemented, readJson } from "@/lib/api/not-implemented";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const parsed = submitActionRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  }
  return notImplemented(`Human action for ${runId}`);
}
