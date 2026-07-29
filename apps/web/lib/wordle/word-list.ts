/**
 * The allowed-guess list, fetched once per page session.
 *
 * This is the half of Wordle feedback that needs no secret, and having it on the
 * client is what makes "not in word list" cost zero milliseconds and zero
 * requests. Colours still come from the server — the answer never ships.
 */
let pending: Promise<Set<string>> | undefined;

export function loadAllowedGuesses(): Promise<Set<string>> {
  pending ??= fetch("/api/wordle/allowed-guesses")
    .then(async (response) => {
      if (!response.ok) throw new Error("Could not load the word list.");
      const body = (await response.json()) as { words: string[] };
      return new Set(body.words.map((word) => word.toUpperCase()));
    })
    .catch((error: unknown) => {
      // Let a later attempt retry rather than caching the failure forever.
      pending = undefined;
      throw error;
    });
  return pending;
}
