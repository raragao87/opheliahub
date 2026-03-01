import "server-only";
import { z } from "zod";
import { chatCompletion, extractJSON } from "./provider";
import type {
  AnalyzeFileStructureInput,
  FileStructureAnalysis,
  MappedFieldName,
} from "./types";

// ── Zod schema for the AI response ─────────────────────────────────────────

const MAPPED_FIELD_NAMES: [MappedFieldName, ...MappedFieldName[]] = [
  "date",
  "description",
  "amount",
  "debit",
  "credit",
  "balance",
  "currency",
  "counterpartyName",
  "counterpartyIban",
  "reference",
  "transactionType",
  "unknown",
];

const detectedFieldSchema = z.object({
  sourceColumn: z.union([z.string(), z.number()]),
  mappedTo: z.enum(MAPPED_FIELD_NAMES),
  confidence: z.number().min(0).max(1),
  sampleValues: z.array(z.string()),
});

const fileStructureAnalysisSchema = z.object({
  detectedFields: z.array(detectedFieldSchema),
  dateFormat: z.string(),
  decimalSeparator: z.enum([".", ","]),
  hasHeaderRow: z.boolean(),
  additionalNotes: z.string(),
});

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a bank file format analyst for a personal finance app called OpheliaHub.
Your job is to analyze the first few lines of a bank export file and identify what each column contains.

The app is used primarily in the Netherlands and Portugal, so you will frequently see:
- ING Bank CSV exports (Dutch): headers like "Datum", "Naam / Omschrijving", "Rekening", "Tegenrekening", "Code", "Af Bij", "Bedrag (EUR)"
- ABN AMRO CSV exports (Dutch): headers like "Datum", "Omschrijving", "Bedrag"
- Revolut CSV exports (English): headers like "Started Date", "Description", "Amount", "Currency"
- Millennium BCP (Portuguese): various formats, often semicolon-separated
- Generic bank exports with columns for date, description, amount (sometimes split into debit/credit)

For each column, identify which semantic field it represents. Valid mappedTo values are:
- "date": transaction date
- "description": transaction description or merchant name
- "amount": a single amount column (positive = credit, negative = debit)
- "debit": debit-only amount column (money out, usually positive numbers)
- "credit": credit-only amount column (money in, usually positive numbers)
- "balance": running account balance (NOT the transaction amount)
- "currency": currency code (EUR, USD, etc.)
- "counterpartyName": name of the other party
- "counterpartyIban": IBAN of the other party
- "reference": payment reference or transaction ID
- "transactionType": category or type code from the bank
- "unknown": cannot determine

For date format, use date-fns format strings (e.g. "dd-MM-yyyy", "yyyyMMdd", "yyyy-MM-dd", "d MMM yyyy").
For decimalSeparator: European format uses comma (1.234,56), US/international uses period (1,234.56).

IMPORTANT: Respond ONLY with a valid JSON object. No markdown, no code fences, no explanation, no <think> tags.

The JSON must match this exact structure:
{
  "detectedFields": [
    {
      "sourceColumn": "column header or 0-based index",
      "mappedTo": "one of the valid values above",
      "confidence": 0.95,
      "sampleValues": ["val1", "val2", "val3"]
    }
  ],
  "dateFormat": "dd-MM-yyyy",
  "decimalSeparator": ",",
  "hasHeaderRow": true,
  "additionalNotes": "Any extra observations about this file format"
}`;

// ── Main function ───────────────────────────────────────────────────────────

/**
 * Uses the MiniMax AI to analyze the structure of a bank export file.
 * Sends the first few lines to the AI and returns detected column mappings,
 * date format, decimal separator, and other metadata.
 *
 * Returns null if Ophelia is disabled, the API call fails, or the response
 * cannot be parsed — callers should fall back to manual column mapping.
 */
export async function analyzeFileStructure(
  input: AnalyzeFileStructureInput
): Promise<FileStructureAnalysis | null> {
  // Extract header + first 5 data rows for analysis (keep tokens low)
  const lines = input.rawContent.split("\n").filter((l) => l.trim().length > 0);
  const sampleLines = lines.slice(0, 6); // header + up to 5 data rows

  const userMessage = `Analyze this bank export file.

Filename: ${input.filename}
Delimiter: ${input.delimiter ?? "unknown (auto-detect)"}

File content (first ${sampleLines.length} lines):
\`\`\`
${sampleLines.join("\n")}
\`\`\`

Identify all columns and return the JSON analysis.`;

  const raw = await chatCompletion({ systemPrompt: SYSTEM_PROMPT, userMessage });
  if (!raw) return null;

  // Strip any <think>...</think> reasoning block MiniMax-M2.5 may prepend
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  const parsed = extractJSON<unknown>(withoutThink);
  if (!parsed) {
    console.error("[Ophelia] analyzeFileStructure: could not extract JSON from response");
    return null;
  }

  const result = fileStructureAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[Ophelia] analyzeFileStructure: schema validation failed", result.error.issues);
    return null;
  }

  return result.data;
}
