import { NotImplementedError } from "@ai-ramp/engine";
import type { WordlePublicState } from "@ai-ramp/protocol";

export interface WordleState {
  answer: string;
  guesses: string[];
}

/** Pure Wordle rules belong here; orchestration and model calls do not. */
export class WordleModel {
  static readonly WORD_LENGTH = 5;
  static readonly MAX_TRIES = 6;

  constructor(readonly state: WordleState) {}

  guessWord(_guess: string): boolean {
    throw new NotImplementedError("Wordle guess validation and scoring");
  }

  formattedState(): string {
    throw new NotImplementedError("Wordle formatted model view");
  }

  publicState(_revealAnswer = false): WordlePublicState {
    throw new NotImplementedError("Wordle public-state projection");
  }

  get isGameOver(): boolean {
    throw new NotImplementedError("Wordle completion rules");
  }

  serialize(): WordleState {
    return { answer: this.state.answer, guesses: [...this.state.guesses] };
  }
}
