import type { GameModule } from "@ai-ramp/engine";
import { codenamesActionSchema, codenamesConfigSchema } from "@ai-ramp/protocol";
import { codenamesDefinition } from "./definition";
import { CODENAMES_PROMPT_VERSION } from "./prompts";

export const codenamesModule: GameModule<"codenames"> = {
  manifest: {
    id: "codenames",
    label: "Codenames",
    description: "Two humans coordinate against an AI spymaster and operative.",
    modes: ["play", "benchmark"],
    modelCount: { min: 2, max: 2 },
    humanSeats: ["red-spymaster", "red-operative"],
    engineVersion: "runner-v1",
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
