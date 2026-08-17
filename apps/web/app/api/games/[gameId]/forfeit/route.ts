import { forfeitGame } from "@/lib/wordle/game-store";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  const snapshot = forfeitGame(gameId);
  return snapshot
    ? Response.json({ snapshot })
    : Response.json({ error: "not_found" }, { status: 404 });
}
