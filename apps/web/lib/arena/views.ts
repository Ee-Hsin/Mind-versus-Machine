import {
  WORDLE_MAX_TRIES,
  type ActorKind,
  type WordleGuessRow,
  type WordleSeatView,
} from "@ai-ramp/protocol";

/**
 * A seat's board as the server holds it: canonical, with real letters. Never
 * hand one of these to a client — go through `toSeatView`, which is the single
 * place that decides what a viewer may see.
 */
export interface SeatBoard {
  seatId: string;
  actorKind: ActorKind;
  modelId?: string;
  displayName: string;
  rows: WordleGuessRow[];
  isWon: boolean;
  isGameOver: boolean;
}

export function emptyBoard(seat: Omit<SeatBoard, "rows" | "isWon" | "isGameOver">): SeatBoard {
  return { ...seat, rows: [], isWon: false, isGameOver: false };
}

/**
 * Project a board for a viewer.
 *
 * While the human's game is live, model rows keep their colours but lose their
 * letters — a spectator may see how well a model is doing, never *what* it
 * guessed, because that would leak the answer. `revealed` flips once the human's
 * board is over, at which point everything unseals.
 *
 * Concealment lives here and nowhere else. Game definitions publish canonical
 * state and every client-facing path funnels through this function, so there is
 * one place to audit rather than one per route.
 */
export function toSeatView(board: SeatBoard, revealed: boolean): WordleSeatView {
  const concealed = board.actorKind === "model" && !revealed;
  return {
    seatId: board.seatId,
    actorKind: board.actorKind,
    ...(board.modelId ? { modelId: board.modelId } : {}),
    displayName: board.displayName,
    board: board.rows.map((row) => ({
      guess: concealed ? "" : row.guess,
      states: [...row.states],
    })),
    guessesMade: board.rows.length,
    triesRemaining: Math.max(0, WORDLE_MAX_TRIES - board.rows.length),
    isWon: board.isWon,
    isGameOver: board.isGameOver,
    concealed,
  };
}
