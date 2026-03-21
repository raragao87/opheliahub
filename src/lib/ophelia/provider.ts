import "server-only";
import OpenAI from "openai";
import { env } from "@/env";

// ── Client singleton ────────────────────────────────────────────────────────

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: env.MINIMAX_API_KEY ?? "",
      baseURL: "https://api.minimax.io/v1",
    });
  }
  return _client;
}

// ── chatCompletion ──────────────────────────────────────────────────────────

interface ChatCompletionInput {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Provider-agnostic wrapper around the MiniMax chat completions API.
 * Returns the text content of the first choice, or null on any error.
 * To switch providers, only this file needs to change.
 */
export async function chatCompletion({
  systemPrompt,
  userMessage,
  temperature = 0.2,
  maxTokens = 4096,
}: ChatCompletionInput): Promise<string | null> {
  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: "MiniMax-M2.5",
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });
    return response.choices[0]?.message?.content ?? null;
  } catch (err) {
    console.error("[Ophelia] chatCompletion error:", err);
    return null;
  }
}

// ── chatConversation (multi-turn) ───────────────────────────────────────────

export async function chatConversation({
  systemPrompt,
  messages,
  temperature = 0.4,
  maxTokens = 2048,
}: {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
}): Promise<string | null> {
  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: "MiniMax-M2.5",
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    });
    const raw = response.choices[0]?.message?.content ?? null;
    if (!raw) return null;
    // Strip <think> reasoning blocks from MiniMax-M2.5
    return raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  } catch (err) {
    console.error("[Ophelia] chatConversation error:", err);
    return null;
  }
}

// ── extractJSON ─────────────────────────────────────────────────────────────

/**
 * Strips markdown fences and finds the first valid JSON object or array in
 * the response. MiniMax-M2.5 is a reasoning model and may wrap JSON in
 * markdown code fences or add explanatory text around it.
 * Returns null if no valid JSON is found.
 */
export function extractJSON<T = unknown>(raw: string): T | null {
  // Strip <think>...</think> reasoning blocks (MiniMax-M2.5 reasoning model)
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const stripped = raw
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Find the first { or [ and the last matching } or ]
  const firstBrace = stripped.indexOf("{");
  const firstBracket = stripped.indexOf("[");

  let start: number;
  let closingChar: string;

  if (firstBrace === -1 && firstBracket === -1) return null;

  if (firstBrace === -1) {
    start = firstBracket;
    closingChar = "]";
  } else if (firstBracket === -1) {
    start = firstBrace;
    closingChar = "}";
  } else if (firstBracket < firstBrace) {
    start = firstBracket;
    closingChar = "]";
  } else {
    start = firstBrace;
    closingChar = "}";
  }

  const end = stripped.lastIndexOf(closingChar);
  if (end === -1 || end < start) return null;

  const candidate = stripped.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

// ── isOpheliaEnabled ────────────────────────────────────────────────────────

export function isOpheliaEnabled(): boolean {
  return env.OPHELIA_ENABLED;
}
