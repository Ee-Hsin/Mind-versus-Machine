export const INITIAL_ELO = 1200;
const K = 32;

/** `scoreA` is 1 for a win, 0 for a loss, and 0.5 for a draw. */
export function updateElo(ratingA: number, ratingB: number, scoreA: number) {
  const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  const delta = K * (scoreA - expectedA);
  return { ratingA: ratingA + delta, ratingB: ratingB - delta };
}
