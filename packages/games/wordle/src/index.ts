import type { GameModule } from "@ai-ramp/engine";
import { RUNNER_VERSION, WORDLE_HUMAN_SEAT, wordleActionSchema, wordleConfigSchema } from "@ai-ramp/protocol";
import { wordleDefinition } from "./definition";
import { WORDLE_PROMPT_VERSION } from "./prompts";

export const wordleModule: GameModule<"wordle"> = {
  manifest: {
    id: "wordle",
    label: "Wordle",
    description: "Race humans and language models on the same hidden word.",
    modelCount: { min: 1, max: 5 },
    humanSeats: [WORDLE_HUMAN_SEAT],
    engineVersion: RUNNER_VERSION,
    promptVersion: WORDLE_PROMPT_VERSION,
  },
  configSchema: wordleConfigSchema,
  actionSchema: wordleActionSchema,
  definition: wordleDefinition,
};

export * from "./model";
export * from "./prompts";
export * from "./adapter";
export * from "./definition";
export { validGuesses } from "./wordle";
