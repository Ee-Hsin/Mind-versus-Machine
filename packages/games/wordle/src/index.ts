import type { GameModule } from "@ai-ramp/engine";
import { wordleActionSchema, wordleConfigSchema } from "@ai-ramp/protocol";
import { wordleDefinition } from "./definition";
import { WORDLE_PROMPT_VERSION } from "./prompts";

export const wordleModule: GameModule<"wordle"> = {
  manifest: {
    id: "wordle",
    label: "Wordle",
    description: "Race humans and language models on the same hidden word.",
    modes: ["play", "benchmark"],
    modelCount: { min: 1, max: 5 },
    humanSeats: ["human-wordle"],
    engineVersion: "wireframe-v1",
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
