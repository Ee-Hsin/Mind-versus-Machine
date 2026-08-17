import { z } from "zod";
import { readJson } from "@/lib/api/json";
import { submitGuess } from "@/lib/wordle/game-store";
import { WORDLE_MAX_TRIES } from "@/lib/wordle/types";

export const runtime = "nodejs";

const submitGuessSchema = z.object({
  guess: z.string().trim().regex(/^[A-Za-z]{5}$/),
  expectedTurn: z.number().int().min(1).max(WORDLE_MAX_TRIES),
});

export async function POST(request: Request, context: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  const parsed = submitGuessSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = submitGuess(gameId, parsed.data.guess, parsed.data.expectedTurn);
  return result
    ? Response.json({ result })
    : Response.json({ error: "not_found" }, { status: 404 });
}
