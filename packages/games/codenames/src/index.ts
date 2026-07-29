import type { GameModule } from "@ai-ramp/engine";
import { RUNNER_VERSION, codenamesActionSchema, codenamesConfigSchema } from "@ai-ramp/protocol";
import { codenamesDefinition } from "./definition";
import { CODENAMES_PROMPT_VERSION } from "./prompts";

export const codenamesModule: GameModule<"codenames"> = {
  manifest: {
    id: "codenames",
    label: "Codenames",
    description: "Two humans coordinate against an AI spymaster and operative.",
    modelCount: { min: 2, max: 2 },
    humanSeats: ["red-spymaster", "red-operative"],
    engineVersion: RUNNER_VERSION,
    promptVersion: CODENAMES_PROMPT_VERSION,
  },
  configSchema: codenamesConfigSchema,
  actionSchema: codenamesActionSchema,
  definition: codenamesDefinition,
};

export * from "./model";
export * from "./prompts";
export * from "./adapter";
export * from "./definition";
