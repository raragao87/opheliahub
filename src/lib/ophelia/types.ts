// ── analyzeFileStructure ────────────────────────────────────────────────────

/**
 * The semantic field a source column maps to.
 * Aligns with the ColumnMapping interface in csv-parser.ts plus additional
 * fields Ophelia can detect (balance, IBAN, etc.) for future use.
 */
export type MappedFieldName =
  | "date"
  | "description"
  | "amount"
  | "debit"
  | "credit"
  | "balance"
  | "currency"
  | "counterpartyName"
  | "counterpartyIban"
  | "reference"
  | "transactionType"
  | "unknown";

export interface DetectedField {
  /** Column header (if present) or 0-based column index for header-less files */
  sourceColumn: string | number;
  /** Which semantic field this column maps to */
  mappedTo: MappedFieldName;
  /** 0–1 confidence score */
  confidence: number;
  /** A few representative values from this column */
  sampleValues: string[];
  /**
   * For debit/credit columns: whether the values are stored as positive
   * numbers ("positive", the most common case) or as negative numbers
   * ("negative", e.g. eToro's "Money Out" column stores outflows as -87.17).
   * Omitted for non-amount columns.
   */
  signConvention?: "positive" | "negative";
}

export interface FileStructureAnalysis {
  detectedFields: DetectedField[];
  /** Detected date format (e.g. "dd-MM-yyyy", "yyyyMMdd", "yyyy-MM-dd") */
  dateFormat: string;
  /** Decimal separator used in amount columns */
  decimalSeparator: "." | ",";
  /** Whether the first row is a header row */
  hasHeaderRow: boolean;
  /** Any extra observations (e.g. "This looks like an ING export", "Column 5 contains SEPA IBANs") */
  additionalNotes: string;
  /**
   * The bank or institution name detected from the file content or filename
   * (e.g. "eToro", "ING", "ABN AMRO", "Revolut"). Null if cannot be determined.
   */
  detectedInstitution: string | null;
}

export interface AnalyzeFileStructureInput {
  /** First 30 lines of the file, as a single string */
  rawContent: string;
  /** Original filename (helps detect bank format from naming conventions) */
  filename: string;
  /** Detected or guessed delimiter */
  delimiter?: string;
}

// ── enrichTransactions ───────────────────────────────────────────────────────

export interface EnrichTransactionInput {
  date: string;
  description: string;
  /** Amount in cents (negative = expense) */
  amount: number;
  counterpartyName?: string;
}

export interface CategoryContext {
  id: string;
  name: string;
  parentName?: string;
}

export interface TagContext {
  id: string;
  name: string;
  groupName?: string;
}

export interface RecentExample {
  description: string;
  categoryName: string;
  displayName: string;
  tags: string[];
  /** Optional note shown in the prompt — used to highlight corrections. */
  note?: string;
}

export interface EnrichTransactionsInput {
  transactions: EnrichTransactionInput[];
  categories: CategoryContext[];
  tags: TagContext[];
  recentExamples: RecentExample[];
}

export interface EnrichmentResult {
  /** 0-based index into the input transactions array */
  index: number;
  /** Category ID from the provided categories list, or null if no good match */
  suggestedCategoryId: string | null;
  /** 0–1 confidence for the category suggestion */
  categoryConfidence: number;
  /** Human-readable display name (cleaned up merchant name) */
  suggestedDisplayName: string;
  /** Tag IDs from the provided tags list */
  suggestedTags: string[];
  /** 0–1 confidence for the tag suggestions */
  tagConfidence: number;
}
