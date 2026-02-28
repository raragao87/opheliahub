import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/env";

let _client: Anthropic | null = null;

export function getOpheliaClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Provide an API key to use Ophelia.",
    );
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export function isOpheliaEnabled(): boolean {
  return env.OPHELIA_ENABLED;
}
