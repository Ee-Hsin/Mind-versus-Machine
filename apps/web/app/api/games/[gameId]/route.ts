import { getGame } from "@/lib/wordle/game-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  const snapshot = getGame(gameId);
  return snapshot
    ? Response.json({ snapshot }, { headers: { "Cache-Control": "no-store" } })
    : Response.json({ error: "not_found" }, { status: 404 });
}
