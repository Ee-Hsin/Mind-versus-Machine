import { submitActionRequestSchema } from "@ai-ramp/protocol";
import { apiError, participantToken, repository, tokenHash } from "@/lib/api/repository";
import { readJson } from "@/lib/api/json";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const token = participantToken(request);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = submitActionRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return Response.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  try {
    const turn = await repository().submitHumanAction({ runId, turnId: parsed.data.turnId,
      tokenHash: tokenHash(token), action: parsed.data.action, idempotencyKey: parsed.data.idempotencyKey });
    return Response.json({ turn });
  } catch (error) { return apiError(error); }
}
