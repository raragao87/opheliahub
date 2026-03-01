import "server-only";
import { z } from "zod";
import { chatCompletion, extractJSON } from "./provider";
import type {
  EnrichTransactionsInput,
  EnrichmentResult,
} from "./types";

// ── Zod schema for the AI response ──────────────────────────────────────────

const enrichmentResultSchema = z.object({
  index: z.number().int().min(0),
  suggestedCategoryId: z.string().nullable(),
  categoryConfidence: z.number().min(0).max(1),
  suggestedDisplayName: z.string(),
  suggestedTags: z.array(z.string()),
  tagConfidence: z.number().min(0).max(1),
});

const enrichmentResponseSchema = z.array(enrichmentResultSchema);

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(
  categories: EnrichTransactionsInput["categories"],
  tags: EnrichTransactionsInput["tags"],
  recentExamples: EnrichTransactionsInput["recentExamples"]
): string {
  const categoryList = categories
    .map((c) => `  { "id": "${c.id}", "name": "${c.name}"${c.parentName ? `, "parent": "${c.parentName}"` : ""} }`)
    .join("\n");

  const tagList = tags
    .map((t) => `  { "id": "${t.id}", "name": "${t.name}"${t.groupName ? `, "group": "${t.groupName}"` : ""} }`)
    .join("\n");

  const examplesSection =
    recentExamples.length > 0
      ? `\nHere are examples of how this user categorizes their transactions:\n${recentExamples
          .map(
            (e) =>
              `  - Description: "${e.description}" → category: "${e.categoryName}", displayName: "${e.displayName}"${e.tags.length > 0 ? `, tags: [${e.tags.map((t) => `"${t}"`).join(", ")}]` : ""}${e.note ? ` [${e.note}]` : ""}`
          )
          .join("\n")}`
      : "";

  return `You are Ophelia, a transaction categorization assistant for a personal finance app called OpheliaHub.
Your job is to categorize bank transactions and suggest clean display names and relevant tags.

The app is used primarily in the Netherlands and Portugal. Transactions are often in Dutch or Portuguese.

Available categories:
[
${categoryList}
]

Available tags:
[
${tagList}
]
${examplesSection}

Rules:
- For "suggestedCategoryId": pick the best matching category ID from the list above, or null if no category fits well
- For "categoryConfidence": 0.9+ for obvious matches (e.g., "Albert Heijn" → Groceries), 0.5-0.8 for likely matches, below 0.5 for guesses
- For "suggestedDisplayName": clean up the raw bank description into a readable merchant/payee name. Remove noise like terminal IDs, city codes, reference numbers. Examples: "ALBERT HEIJN 1021 AMSTERDAM" → "Albert Heijn", "CCV*RESTAURANT DE HAVEN AMS" → "Restaurant de Haven", "NS INT AMSTERDAM CENTRAAL" → "NS Internationaal"
- For "suggestedTags": pick tag IDs from the list that are relevant; return empty array if no tags fit
- For "tagConfidence": overall confidence for the tag suggestions (0–1)
- If the category list is empty, always return null for suggestedCategoryId
- If the tag list is empty, always return [] for suggestedTags

IMPORTANT: Respond ONLY with a valid JSON array. No markdown, no code fences, no explanation, no <think> tags.

The JSON must be an array where each element matches this exact structure:
{
  "index": 0,
  "suggestedCategoryId": "category-id-here-or-null",
  "categoryConfidence": 0.95,
  "suggestedDisplayName": "Merchant Name",
  "suggestedTags": ["tag-id-1"],
  "tagConfidence": 0.8
}`;
}

// ── Batching helper ───────────────────────────────────────────────────────────

const BATCH_SIZE = 80;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Uses Ophelia AI to suggest categories, display names, and tags for a batch
 * of parsed (but not yet committed) transactions.
 *
 * Handles batching automatically: if more than 100 transactions are provided,
 * they are split into chunks of 80 and processed in parallel.
 *
 * Returns null if the API call fails or the response cannot be parsed —
 * callers should fall back to no suggestions.
 */
export async function enrichTransactions(
  input: EnrichTransactionsInput
): Promise<EnrichmentResult[] | null> {
  const { transactions, categories, tags, recentExamples } = input;

  if (transactions.length === 0) return [];

  const systemPrompt = buildSystemPrompt(categories, tags, recentExamples);

  // Split into batches if needed
  const batches =
    transactions.length > 100
      ? chunkArray(transactions, BATCH_SIZE)
      : [transactions];

  // Build offset map so each batch knows its starting index in the original array
  const batchOffsets = batches.map((_, i) =>
    batches.slice(0, i).reduce((sum, b) => sum + b.length, 0)
  );

  // Process all batches (in parallel for speed)
  const batchPromises = batches.map(async (batch, batchIdx) => {
    const offset = batchOffsets[batchIdx];

    const userMessage = `Categorize the following ${batch.length} bank transactions. Return a JSON array with one entry per transaction.

Transactions (0-based index within this batch):
${JSON.stringify(
  batch.map((tx, i) => ({
    index: i,
    date: tx.date,
    description: tx.description,
    amountCents: tx.amount,
    ...(tx.counterpartyName ? { counterpartyName: tx.counterpartyName } : {}),
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
      console.error(
        `[Ophelia] enrichTransactions: could not extract JSON from response (batch ${batchIdx})`
      );
      return null;
    }

    const result = enrichmentResponseSchema.safeParse(parsed);
    if (!result.success) {
      console.error(
        `[Ophelia] enrichTransactions: schema validation failed (batch ${batchIdx})`,
        result.error.issues
      );
      return null;
    }

    // Remap local batch indices to global indices
    return result.data.map((entry) => ({
      ...entry,
      index: entry.index + offset,
    }));
  });

  const batchResults = await Promise.all(batchPromises);

  // If any batch failed, return null
  if (batchResults.some((r) => r === null)) return null;

  // Merge and sort by original index
  const merged = (batchResults as EnrichmentResult[][]).flat();
  merged.sort((a, b) => a.index - b.index);

  return merged;
}
