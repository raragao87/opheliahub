import "server-only";
import { z } from "zod";
import { chatCompletion, extractJSON } from "./provider";

export interface DuplicatePair {
  /** 0-based index of the imported transaction in the original input array */
  index: number;
  newTransaction: { date: string; description: string; amount: number };
  existingTransaction: { date: string; description: string; amount: number; displayName: string };
}

export interface DuplicateResolution {
  pairIndex: number;
  isDuplicate: boolean;
  /** 0–1 confidence score */
  confidence: number;
  /** Brief explanation shown to the user (max ~100 chars) */
  reasoning: string;
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const resolutionSchema = z.array(
  z.object({
    pairIndex: z.number().int().min(0),
    isDuplicate: z.boolean(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  })
);

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Uses Ophelia AI to decide whether fuzzy transaction pairs are duplicates.
 *
 * Only called for "weak fuzzy" matches: same amount + date (±1 day) but
 * different descriptions. Exact externalId matches and description-similar
 * matches are already handled deterministically before this is called.
 *
 * Returns null when Ophelia is disabled, the API call fails, or the response
 * cannot be parsed — callers should fall back to manual review.
 */
export async function resolveDuplicates(
  pairs: DuplicatePair[]
): Promise<DuplicateResolution[] | null> {
  if (pairs.length === 0) return [];

  const systemPrompt = `You are helping detect duplicate bank transactions during a file import.

The user is importing new transactions. The pairs below each have the SAME date and SAME amount as an existing transaction in the database, but DIFFERENT descriptions. Decide if each pair is the same real-world event (a duplicate) or two distinct transactions.

Common patterns:
- Same transaction appearing twice: different export formats, one from bank portal and one from app → DUPLICATE
- Manual entry vs imported version of the same payment → DUPLICATE
- Recurring charges: same merchant, same amount, same day-of-month in different months → NOT a duplicate
- Refund matching a prior payment by amount → NOT a duplicate (different event)
- Two different payments to same merchant on the same day → usually NOT a duplicate

Use high confidence (0.9+) when you are very sure.
Use low confidence (0.4–0.7) when genuinely uncertain.

IMPORTANT: Respond ONLY with a valid JSON array. No markdown, no explanation, no <think> tags.

Each element must have exactly this structure:
{
  "pairIndex": 0,
  "isDuplicate": true,
  "confidence": 0.92,
  "reasoning": "Same transaction — different description formats from the same bank"
}`;

  const userMessage = `Check these ${pairs.length} candidate duplicate pair${pairs.length !== 1 ? "s" : ""}:

${JSON.stringify(
  pairs.map((p) => ({
    pairIndex: p.index,
    newTransaction: p.newTransaction,
    existingTransaction: p.existingTransaction,
  })),
  null,
  2
)}`;

  const raw = await chatCompletion({ systemPrompt, userMessage });
  if (!raw) return null;

  // Strip any <think>...</think> reasoning block
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  const parsed = extractJSON<unknown>(withoutThink);
  if (!parsed) {
    console.error("[Ophelia] resolveDuplicates: could not extract JSON from response");
    return null;
  }

  const result = resolutionSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[Ophelia] resolveDuplicates: schema validation failed", result.error.issues);
    return null;
  }

  return result.data;
}
