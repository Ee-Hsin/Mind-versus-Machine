export const WORDLE_MAX_TRIES = 6;
export const WORDLE_WORD_LENGTH = 5;

export type GameStatus = "in_progress" | "completed" | "forfeited";
export type ModelStatus = "waiting" | "playing" | "finished" | "failed";
export type WordleLetterState = "green" | "yellow" | "gray";

export interface ModelRef {
  id: string;
  displayName: string;
}

export interface WordleGuessRow {
  guess: string;
  states: WordleLetterState[];
}

export interface WordleSeatView {
  seatId: string;
  displayName: string;
  board: WordleGuessRow[];
  guessesMade: number;
  triesRemaining: number;
  isWon: boolean;
  isGameOver: boolean;
  concealed: boolean;
  status: ModelStatus;
}

export interface WordleSnapshot {
  gameId: string;
  status: GameStatus;
  expiresAt: string;
  revealed: boolean;
  allModelsSettled: boolean;
  answer?: string;
  you: WordleSeatView;
  models: WordleSeatView[];
}

export interface WordleGuessResult {
  accepted: boolean;
  reason?: string;
  snapshot: WordleSnapshot;
}
