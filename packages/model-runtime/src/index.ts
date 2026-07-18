import type { LanguageModel } from "ai";
import type { ModelPlayer } from "@ai-ramp/engine";
import { NotImplementedError } from "@ai-ramp/engine";
import type { ModelRef } from "@ai-ramp/protocol";
import type { z } from "zod";

export interface ModelCatalogEntry extends ModelRef {
  provider: string;
  requiredEnvironmentVariable: string;
  createModel: () => LanguageModel;
}

export class AiSdkModelPlayer implements ModelPlayer {
  constructor(
    readonly id: string,
    private readonly model: LanguageModel,
  ) {}

  async act<Action>(
    _system: string,
    _prompt: string,
    _schema: z.ZodType<Action>,
  ): Promise<{ action: Action; latencyMs: number }> {
    void this.model;
    throw new NotImplementedError("Vercel AI SDK model execution");
  }
}

export function listConfiguredModels(): ModelRef[] {
  const ids = (process.env.ARENA_MODELS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return ids.map((id) => ({ id, displayName: id.split(":").at(-1) ?? id }));
}
