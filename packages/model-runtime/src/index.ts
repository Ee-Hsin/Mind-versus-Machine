import { anthropic } from "@ai-sdk/anthropic";
import { cohere } from "@ai-sdk/cohere";
import { google } from "@ai-sdk/google";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { xai } from "@ai-sdk/xai";
import { generateObject, NoObjectGeneratedError, type LanguageModel } from "ai";
import type { ModelPlayer } from "@ai-ramp/engine";
import type { ModelRef } from "@ai-ramp/protocol";
import { z } from "zod";

export class AiSdkModelPlayer implements ModelPlayer {
  constructor(readonly id: string, private readonly model: LanguageModel = resolveModel(id)) {}

  async act<Action>(
    system: string,
    prompt: string,
    schema: z.ZodType<Action>,
    options?: { signal?: AbortSignal; onCommentaryDelta?: (delta: string) => void | Promise<void> },
  ) {
    const wrapped = !(schema instanceof z.ZodObject);
    const startedAt = Date.now();
    let currentPrompt = prompt;
    for (let structuredAttempt = 1; structuredAttempt <= 3; structuredAttempt++) {
      try {
        const { object, usage } = await generateObject({
          model: this.model, system, prompt: currentPrompt,
          schema: wrapped ? z.object({ response: schema }) : schema,
          maxRetries: 3,
          abortSignal: options?.signal,
        });
        return {
          action: (wrapped ? (object as { response: Action }).response : object) as Action,
          latencyMs: Date.now() - startedAt,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        };
      } catch (error) {
        if (!NoObjectGeneratedError.isInstance(error) || structuredAttempt === 3) throw error;
        currentPrompt = `${prompt}\n\nYour previous structured response was invalid. Return only an object that exactly matches the requested schema. Do not append explanations inside constrained fields.`;
      }
    }
    throw new Error("Structured output retry loop exhausted.");
  }
}

export function resolveModel(id: string): LanguageModel {
  const [provider, ...parts] = id.split(":");
  const model = parts.join(":");
  if (!model) throw new Error(`Expected provider:model, received ${id}.`);
  if (provider === "openai") return openai(model);
  if (provider === "anthropic") return anthropic(model);
  if (provider === "google") return google(model);
  if (provider === "xai") return xai(model);
  if (provider === "cohere") return cohere(model);
  if (provider === "deepseek") {
    return createOpenAI({
      name: "deepseek",
      baseURL: "https://api.deepseek.com",
      apiKey: process.env.DEEPSEEK_API_KEY,
    }).chat(model);
  }
  throw new Error(`Unsupported model provider: ${provider}`);
}

export function listConfiguredModels(): ModelRef[] {
  return (process.env.ARENA_MODELS ?? "").split(",").map((id) => id.trim()).filter(Boolean)
    .map((id) => ({ id, displayName: id.split(":").at(-1) ?? id }));
}
