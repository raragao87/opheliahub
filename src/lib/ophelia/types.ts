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
}

export interface AnalyzeFileStructureInput {
  /** First 30 lines of the file, as a single string */
  rawContent: string;
  /** Original filename (helps detect bank format from naming conventions) */
  filename: string;
  /** Detected or guessed delimiter */
  delimiter?: string;
}
