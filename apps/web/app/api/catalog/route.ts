import { listConfiguredModels } from "@/lib/openrouter";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    models: listConfiguredModels(),
  });
}
