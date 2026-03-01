import "server-only";
import { z } from "zod";
import { chatCompletion, extractJSON } from "./provider";

// ── Output types ──────────────────────────────────────────────────────────────

export interface ExtractedTransaction {
  date: string;        // ISO date string, e.g. "2024-03-15"
  description: string;
  /** Floating-point amount in the main currency unit. Negative = expense. */
  amount: number;
  currency?: string;
}

export interface UnknownFormatResult {
  transactions: ExtractedTransaction[];
  /** Best guess at the file format, e.g. "OFX", "QIF", "custom CSV" */
  formatGuess: string;
  /** Overall confidence (0–1) that the extracted data is correct */
  confidence: number;
  /** Any caveats or things the AI is unsure about */
  warnings: string[];
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const extractedTransactionSchema = z.object({
  date: z.string(),
  description: z.string(),
  amount: z.number(),
  currency: z.string().optional(),
});

const unknownFormatResultSchema = z.object({
  transactions: z.array(extractedTransactionSchema),
  formatGuess: z.string(),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});

// ── Main function ─────────────────────────────────────────────────────────────

const MAX_CHARS = 8_000;
const MAX_LINES = 100;

/**
 * Uses Ophelia AI to extract transactions from a file in an unrecognized format.
 *
 * Only the first ~100 lines / 8 KB are sent to the AI.
 * Returns null when the API call fails or the response cannot be parsed.
 * The caller should check `confidence` before trusting the output.
 */
export async function extractFromUnknown(
  rawContent: string,
  filename: string
): Promise<UnknownFormatResult | null> {
  // Trim the content to the first MAX_LINES lines or MAX_CHARS chars
  const lines = rawContent.split("\n").slice(0, MAX_LINES).join("\n");
  const sample = lines.length > MAX_CHARS ? lines.slice(0, MAX_CHARS) : lines;

  const systemPrompt = `You are a bank statement parser. Your job is to extract transactions from any text-based bank export file, regardless of format.

Supported input formats include (but are not limited to): OFX, QFX, QIF, CAMT.053, MT940, unusual CSV variants, plain-text statements, and any other bank export format.

Rules:
- Extract every transaction you can find in the file
- For each transaction, return: date (ISO format YYYY-MM-DD), description (payee/merchant name, cleaned), amount (float in main currency unit — NEGATIVE for expenses/debits, POSITIVE for income/credits), and optional currency code
- Set "confidence" (0–1) for how confident you are that the data is correctly extracted. Use 0.9+ when the format is clearly structured, 0.3–0.6 when parsing is uncertain
- Set "formatGuess" to a short description of what format this appears to be (e.g. "OFX", "QIF", "ABN AMRO custom CSV", "plain text statement")
- Add "warnings" for anything uncertain (e.g. "amounts may have wrong sign", "dates assumed to be DD-MM-YYYY")
- If you cannot find any transactions, return an empty transactions array with confidence 0

IMPORTANT: Respond ONLY with a valid JSON object. No markdown, no explanation, no <think> tags.

Response structure:
{
  "transactions": [
    { "date": "2024-03-15", "description": "Albert Heijn", "amount": -45.20, "currency": "EUR" }
  ],
  "formatGuess": "OFX",
  "confidence": 0.92,
  "warnings": []
}`;

  const userMessage = `Extract transactions from this file. Filename: "${filename}"

File content (first ${MAX_LINES} lines):
${sample}`;

  const raw = await chatCompletion({ systemPrompt, userMessage });
  if (!raw) return null;

  // Strip any <think>...</think> reasoning block
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  const parsed = extractJSON<unknown>(withoutThink);
  if (!parsed) {
    console.error("[Ophelia] extractFromUnknown: could not extract JSON from response");
    return null;
  }

  const result = unknownFormatResultSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[Ophelia] extractFromUnknown: schema validation failed", result.error.issues);
    return null;
  }

  return result.data;
}
