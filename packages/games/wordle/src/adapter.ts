import type { GameAdapter } from "@ai-ramp/engine";
import { wordleActionSchema, type WordleAction, type WordlePublicState } from "@ai-ramp/protocol";
import { WordleModel } from "./model";
import { wordleSystemPrompt } from "./prompts";

export class WordleAdapter implements GameAdapter<"wordle"> {
  readonly gameType = "wordle" as const;
  readonly actionSchema = wordleActionSchema;

  constructor(
    private readonly playerId: string,
    private readonly model: WordleModel,
  ) {}

  playersToAct(): string[] {
    return this.model.isGameOver ? [] : [this.playerId];
  }

  systemPromptFor(_playerId: string): string {
    return wordleSystemPrompt();
  }

  viewFor(_playerId: string): string {
    return this.model.formattedState();
  }

  applyAction(_playerId: string, action: WordleAction) {
    const accepted = this.model.guessWord(action.guess);
    return accepted ? { accepted } : { accepted, message: "Guess was not accepted by the Wordle model." };
  }

  isOver(): boolean {
    return this.model.isGameOver;
  }

  result() {
    const state = this.model.publicState(true);
    const score = state.isWon ? state.triesRemaining + 1 : 0;
    return { scores: { [this.playerId]: score }, summary: "Wordle result projection is not implemented." };
  }

  publicStateFor(): WordlePublicState {
    return this.model.publicState();
  }

  serialize(): WordleStateSnapshot {
    return this.model.serialize();
  }
}

type WordleStateSnapshot = ReturnType<WordleModel["serialize"]>;
