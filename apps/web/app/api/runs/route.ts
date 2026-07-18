import { createPlayRunRequestSchema } from "@ai-ramp/protocol";
import { notImplemented, readJson } from "@/lib/api/not-implemented";

export const runtime = "nodejs";

export async function GET() {
  return notImplemented("Run history");
}

export async function POST(request: Request) {
  const parsed = createPlayRunRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  }
  return notImplemented(`Create ${parsed.data.gameType} run`);
}
