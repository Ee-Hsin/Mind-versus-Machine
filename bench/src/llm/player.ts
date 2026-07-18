import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

export interface ActOutcome {
  action: unknown;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface Player {
  readonly name: string;
  act(system: string, prompt: string, schema: z.ZodType): Promise<ActOutcome>;
}

function resolveModel(id: string): LanguageModel {
  const [provider, ...parts] = id.split(":");
  const model = parts.join(":");
  if (!model) throw new Error(`Model id must use provider:model format: ${id}`);
  if (provider === "anthropic") return anthropic(model);
  if (provider === "openai") return openai(model);
  throw new Error(`Unknown provider "${provider}" in model id "${id}"`);
}

export class LLMPlayer implements Player {
  readonly name: string;
  private readonly model: LanguageModel;

  constructor(modelId: string) {
    this.name = modelId;
    this.model = resolveModel(modelId);
  }

  async act(system: string, prompt: string, schema: z.ZodType): Promise<ActOutcome> {
    const wrapped = !(schema instanceof z.ZodObject);
    const startedAt = Date.now();
    const { object, usage } = await generateObject({
      model: this.model,
      system,
      prompt,
      schema: wrapped ? z.object({ response: schema }) : schema,
      maxRetries: 5,
    });
    return {
      action: wrapped ? (object as { response: unknown }).response : object,
      latencyMs: Date.now() - startedAt,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
    };
  }
}

export function makePlayer(id: string): Player {
  return new LLMPlayer(id);
}
