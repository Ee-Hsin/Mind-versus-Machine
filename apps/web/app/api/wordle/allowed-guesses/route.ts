import { validGuesses } from "@ai-ramp/game-wordle";

export const runtime = "nodejs";

let cached: string | undefined;

/**
 * The word list the client validates against, so typing a non-word is rejected
 * in zero milliseconds with no request at all.
 *
 * This is the half of Wordle feedback that needs no secret. Colours still come
 * from the server, which is what keeps the answer out of the browser.
 *
 * Immutable and long-cached: the list only changes when the generator is re-run,
 * and it is serialised once per process.
 */
export async function GET() {
  cached ??= JSON.stringify({ words: validGuesses() });
  return new Response(cached, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800, immutable",
    },
  });
}
