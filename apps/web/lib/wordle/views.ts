import type { WordleModel } from "@ai-ramp/game-wordle";
import {
  WORDLE_MAX_TRIES,
  type ModelStatus,
  type WordleSeatView,
} from "./types";

export function toSeatView(input: {
  seatId: string;
  displayName: string;
  model: WordleModel;
  status: ModelStatus;
  concealed: boolean;
}): WordleSeatView {
  const state = input.model.publicState();
  return {
    seatId: input.seatId,
    displayName: input.displayName,
    board: state.board.map((row) => ({
      guess: input.concealed ? "" : row.guess,
      states: [...row.states],
    })),
    guessesMade: state.guessesMade,
    triesRemaining: Math.max(0, WORDLE_MAX_TRIES - state.guessesMade),
    isWon: state.isWon,
    isGameOver: state.isGameOver,
    concealed: input.concealed,
    status: input.status,
  };
}
