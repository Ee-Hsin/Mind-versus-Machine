import type { GameModule } from "@ai-ramp/engine";
import { imposterActionSchema, imposterConfigSchema } from "@ai-ramp/protocol";
import { imposterDefinition } from "./definition";
import { IMPOSTER_PROMPT_VERSION } from "./prompts";

export const imposterModule: GameModule<"imposter"> = {
  manifest: {
    id: "imposter",
    label: "Imposter",
    description: "Six players give clues, debate, and vote while one hidden Imposter bluffs with only a hint.",
    modes: ["play", "benchmark"],
    modelCount: { min: 2, max: 6 },
    humanSeats: ["P1"],
    engineVersion: "runner-v1",
    promptVersion: IMPOSTER_PROMPT_VERSION,
  },
  configSchema: imposterConfigSchema,
  actionSchema: imposterActionSchema,
  definition: imposterDefinition,
};

export * from "./model";
export * from "./prompts";
export * from "./adapter";
export * from "./definition";
