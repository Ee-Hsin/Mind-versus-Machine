import { Wordle } from "./wordle";

export interface WordlePublicState {
  board: Array<{
    guess: string;
    states: Array<"green" | "yellow" | "gray">;
  }>;
  guessesMade: number;
  triesRemaining: number;
  isWon: boolean;
  isGameOver: boolean;
  answer?: string;
}

export interface WordleState {
  answer: string;
  guesses: string[];
}

/** Package-local façade over the pure Wordle rules. */
export class WordleModel {
  static readonly WORD_LENGTH = Wordle.WORD_LENGTH;
  static readonly MAX_TRIES = Wordle.MAX_TRIES;
  private readonly game: Wordle;

  constructor(state?: WordleState) {
    this.game = state ? Wordle.fromState(state) : new Wordle();
  }

  guessWord(guess: string): boolean {
    return this.game.guessWord(guess);
  }

  formattedState(): string {
    return this.game.formattedState();
  }

  publicState(revealAnswer = false): WordlePublicState {
    const state = this.game.getState();
    return {
      board: state.board.map((row) => ({
        guess: row.guess,
        states: row.states.map((value) => value.toLowerCase() as "green" | "yellow" | "gray"),
      })),
      guessesMade: state.guessesMade,
      triesRemaining: state.triesRemaining,
      isWon: state.isWon,
      isGameOver: state.isGameOver,
      ...(revealAnswer || state.isGameOver ? { answer: state.answer } : {}),
    };
  }

  get isGameOver(): boolean {
    return this.game.isGameOver;
  }

  serialize(): WordleState {
    const { answer, guesses } = this.game.getState();
    return { answer, guesses };
  }
}
