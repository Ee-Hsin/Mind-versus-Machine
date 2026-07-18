import { NotImplementedError, type GameDefinition } from "@ai-ramp/engine";

export const wordleDefinition: GameDefinition<"wordle"> = {
  gameType: "wordle",
  async runMatch() {
    // Match orchestration will create one game per actor with the same answer.
    throw new NotImplementedError("Wordle match orchestration");
  },
};
