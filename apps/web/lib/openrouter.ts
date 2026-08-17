import { validGuesses } from "@ai-ramp/game-wordle";
import type { ModelRef } from "./wordle/types";

const maxConcurrentRequests = positiveInteger(
  process.env.OPENROUTER_MAX_CONCURRENT_REQUESTS,
  3,
);
const requestTimeoutMs = positiveInteger(process.env.OPENROUTER_TIMEOUT_MS, 180_000);
const maxCompletionTokens = positiveInteger(
  process.env.OPENROUTER_MAX_COMPLETION_TOKENS,
  512,
);
const deepSeekMaxCompletionTokens = positiveInteger(
  process.env.OPENROUTER_DEEPSEEK_MAX_COMPLETION_TOKENS,
  4_096,
);
const openAiMaxCompletionTokens = positiveInteger(
  process.env.OPENROUTER_OPENAI_MAX_COMPLETION_TOKENS,
  1_024,
);
const glmMaxCompletionTokens = positiveInteger(
  process.env.OPENROUTER_GLM_MAX_COMPLETION_TOKENS,
  2_048,
);
const geminiMaxCompletionTokens = positiveInteger(
  process.env.OPENROUTER_GEMINI_MAX_COMPLETION_TOKENS,
  1_024,
);

let activeRequests = 0;
const waiting: Array<() => void> = [];
const acceptedWordleGuesses = new Set(validGuesses());
const wordleSystemPrompt =
  "You are playing Wordle. Reply with exactly one valid five-letter English word and no other text.";

interface OpenRouterMessage {
  role: "system" | "user";
  content: string;
}

interface OpenRouterReply {
  content: string;
  reasoning: string;
  finishReason?: string;
}

type Reasoning =
  | { effort: "minimal" | "low" | "medium" | "high" }
  | { enabled: false; exclude: true };

interface CompletionProfile {
  reasoning: Reasoning;
  maxCompletionTokens: number;
  finalReasoning: Reasoning;
  finalMaxCompletionTokens: number;
}

export function listConfiguredModels(environment = process.env): ModelRef[] {
  if (!environment.OPENROUTER_API_KEY) return [];
  const ids = [...new Set(
    (environment.ARENA_MODELS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  )];
  return ids.map((id) => ({ id, displayName: displayModelName(id) }));
}

export async function requestWordleGuess(modelId: string, state: string): Promise<string> {
  const release = await acquireRequestSlot();
  try {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OPENROUTER_API_KEY is required.");

    const baseUrl = (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    const messages: OpenRouterMessage[] = [
      { role: "system", content: wordleSystemPrompt },
      { role: "user", content: state },
    ];
    const profile = completionProfile(modelId);
    const provider = { sort: "throughput" as const };
    const reply = await sendCompletion({
      baseUrl,
      key,
      modelId,
      messages,
      reasoning: profile.reasoning,
      maxCompletionTokens: profile.maxCompletionTokens,
      provider,
    });
    const guess = extractGuess(reply.content);
    if (guess && acceptedWordleGuesses.has(guess)) return guess;

    const finalReply = await sendCompletion({
      baseUrl,
      key,
      modelId,
      messages: [
        { role: "system", content: wordleSystemPrompt },
        {
          role: "user",
          content: finalizationPrompt(state, reply.reasoning, guess),
        },
      ],
      reasoning: profile.finalReasoning,
      maxCompletionTokens: profile.finalMaxCompletionTokens,
      provider,
    });
    const finalGuess = extractGuess(finalReply.content);
    if (!finalGuess || !acceptedWordleGuesses.has(finalGuess)) {
      throw missingGuessError(finalReply.finishReason);
    }
    return finalGuess;
  } finally {
    release();
  }
}

async function sendCompletion(input: {
  baseUrl: string;
  key: string;
  modelId: string;
  messages: OpenRouterMessage[];
  reasoning: Reasoning;
  maxCompletionTokens: number;
  provider?: { sort: "throughput" };
}): Promise<OpenRouterReply> {
  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.modelId,
      messages: input.messages,
      reasoning: input.reasoning,
      max_completion_tokens: input.maxCompletionTokens,
      provider: input.provider,
    }),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`OpenRouter request failed with status ${response.status}.`);

  const body = await response.json() as {
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: string | null; reasoning?: string | null };
    }>;
  };
  const choice = body.choices?.[0];
  return {
    content: choice?.message?.content ?? "",
    reasoning: choice?.message?.reasoning ?? "",
    finishReason: choice?.finish_reason,
  };
}

function completionProfile(modelId: string): CompletionProfile {
  const noReasoning = { enabled: false, exclude: true } as const;
  if (modelId.startsWith("deepseek/")) {
    return {
      reasoning: { effort: "low" },
      maxCompletionTokens: deepSeekMaxCompletionTokens,
      finalReasoning: noReasoning,
      finalMaxCompletionTokens: 128,
    };
  }
  if (modelId.startsWith("openai/")) {
    return {
      reasoning: { effort: "medium" },
      maxCompletionTokens: openAiMaxCompletionTokens,
      finalReasoning: noReasoning,
      finalMaxCompletionTokens: 128,
    };
  }
  if (modelId.startsWith("z-ai/")) {
    return {
      reasoning: { effort: "high" },
      maxCompletionTokens: glmMaxCompletionTokens,
      finalReasoning: noReasoning,
      finalMaxCompletionTokens: 128,
    };
  }
  if (modelId.startsWith("google/")) {
    return {
      reasoning: { effort: "low" },
      maxCompletionTokens: geminiMaxCompletionTokens,
      finalReasoning: { effort: "minimal" },
      finalMaxCompletionTokens: 256,
    };
  }
  return {
    reasoning: { effort: "low" },
    maxCompletionTokens,
    finalReasoning: noReasoning,
    finalMaxCompletionTokens: 128,
  };
}

function extractGuess(content: string): string | null {
  const normalized = content.trim().toUpperCase();
  if (/^[A-Z]{5}$/.test(normalized)) return normalized;

  const namedGuess = normalized.match(/"GUESS"\s*:\s*"([A-Z]{5})"/);
  if (namedGuess) return namedGuess[1];

  const words = normalized.match(/\b[A-Z]{5}\b/g);
  const guess = words?.at(-1);
  return guess ?? null;
}

function missingGuessError(finishReason?: string): Error {
  const suffix = finishReason ? ` Finish reason: ${finishReason}.` : "";
  return new Error(`OpenRouter did not return a five-letter guess.${suffix}`);
}

function finalizationPrompt(state: string, reasoning: string, rejectedGuess: string | null): string {
  const parts = [state];
  if (reasoning) parts.push(`Use this previous analysis to choose your final guess:\n${reasoning}`);
  if (rejectedGuess) parts.push(`${rejectedGuess} is not accepted by this Wordle word list. Choose another word.`);
  parts.push("Return exactly one valid five-letter English word.");
  return parts.join("\n\n");
}

function displayModelName(id: string): string {
  const name = id.split("/").at(-1) ?? id;
  return name.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function acquireRequestSlot(): Promise<() => void> {
  if (activeRequests < maxConcurrentRequests) {
    activeRequests += 1;
  } else {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = waiting.shift();
    if (next) next();
    else activeRequests -= 1;
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
