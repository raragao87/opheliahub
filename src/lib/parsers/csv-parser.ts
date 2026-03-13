import Papa from "papaparse";
import { parse, isValid } from "date-fns";

export interface ColumnMapping {
  date: string;
  description: string;
  amount: string;
  debit?: string; // Some banks use separate debit/credit columns
  credit?: string;
}

export interface ParsedTransaction {
  date: Date;
  description: string;
  amount: number; // cents
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  externalId?: string;
  rawRow?: Record<string, string>;
}

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

export interface CsvTransformResult {
  transactions: ParsedTransaction[];
  errors: { row: number; message: string }[];
}

export interface AmountColumnHints {
  /** Whether the debit column stores values as positive or negative numbers */
  debitSignConvention?: "positive" | "negative";
  /** Whether the credit column stores values as positive or negative numbers */
  creditSignConvention?: "positive" | "negative";
  /**
   * Invert the sign of single-column amounts after parsing.
   * Use for credit card exports where expenses appear as positive numbers.
   */
  invertAmounts?: boolean;
}

// Non-English month abbreviations → English equivalents
const MONTH_MAP: Record<string, string> = {
  // Dutch
  jan: "Jan", feb: "Feb", mrt: "Mar", apr: "Apr", mei: "May", jun: "Jun",
  jul: "Jul", aug: "Aug", sep: "Sep", okt: "Oct", nov: "Nov", dec: "Dec",
  // German extras (jan/feb/apr/jun/jul/aug/sep/nov already covered)
  "mär": "Mar", mai: "May", dez: "Dec",
  // Portuguese extras
  fev: "Feb", mar: "Mar", abr: "Apr", ago: "Aug", set: "Sep", out: "Oct",
  // French extras
  "avr": "Apr", "juil": "Jul", "aoû": "Aug", "aou": "Aug", "déc": "Dec",
  // Spanish extras
  ene: "Jan", abr2: "Apr", // abr already mapped above
};

/** Normalize non-English month abbreviations to English */
function normalizeDateString(dateStr: string): string {
  return dateStr.replace(
    /\b([a-zA-ZÀ-ÿ]{3,4})\b/g,
    (match) => MONTH_MAP[match.toLowerCase()] ?? match
  );
}

/** Parse a CSV file and return headers + raw rows */
export function parseCsvFile(
  content: string,
  delimiter: string = ",",
  skipRows: number = 0
): CsvParseResult {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    delimiter,
    skipEmptyLines: true,
  });

  const rows = skipRows > 0 ? result.data.slice(skipRows) : result.data;

  return {
    headers: result.meta.fields ?? [],
    rows,
    totalRows: rows.length,
  };
}

/** Transform parsed CSV rows into transactions using a column mapping */
export function transformCsvToTransactions(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  dateFormat: string = "dd/MM/yyyy",
  amountHints?: AmountColumnHints
): CsvTransformResult {
  const transactions: ParsedTransaction[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1; // 1-indexed for user display

    try {
      // Parse date
      const rawDateStr = row[mapping.date]?.trim();
      if (!rawDateStr) {
        errors.push({ row: rowNum, message: "Missing date" });
        continue;
      }

      // Normalize non-English month names (e.g., "okt" → "Oct")
      const dateStr = normalizeDateString(rawDateStr);

      let date: Date;
      // Try multiple date formats (including text-month formats)
      const formats = [
        dateFormat,
        "d MMM yyyy",   // 4 Aug 2025
        "dd MMM yyyy",  // 04 Aug 2025
        "yyyyMMdd",
        "yyyy-MM-dd",
        "dd-MM-yyyy",
        "MM/dd/yyyy",
        "dd/MM/yyyy",
        "yyMMdd",
      ];
      let parsed = false;
      for (const fmt of formats) {
        const attempt = parse(dateStr, fmt, new Date());
        if (isValid(attempt)) {
          date = attempt;
          parsed = true;
          break;
        }
      }
      if (!parsed) {
        // Try native Date parsing as last resort
        date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          errors.push({ row: rowNum, message: `Could not parse date: '${rawDateStr}'` });
          continue;
        }
      }

      // Parse amount
      let amountCents: number;

      if (mapping.debit && mapping.credit) {
        // Separate debit/credit columns
        const debitStr = row[mapping.debit]?.trim().replace(/[^\d.,-]/g, "");
        const creditStr = row[mapping.credit]?.trim().replace(/[^\d.,-]/g, "");

        // Skip rows where both debit and credit are empty
        if (!debitStr && !creditStr) {
          errors.push({ row: rowNum, message: "Both debit and credit are empty, skipping" });
          continue;
        }

        let debit = debitStr ? parseAmountString(debitStr) : 0;
        let credit = creditStr ? parseAmountString(creditStr) : 0;

        // Normalize sign: if a column stores outflows as negative numbers
        // (e.g. eToro's Money Out = -87.17), flip to positive before computing
        // credit - debit so the resulting amount has the correct sign.
        if (amountHints?.debitSignConvention === "negative") debit = -debit;
        if (amountHints?.creditSignConvention === "negative") credit = -credit;

        amountCents = credit - debit;
      } else {
        const amountStr = row[mapping.amount]?.trim();
        if (!amountStr) {
          errors.push({ row: rowNum, message: "Missing amount" });
          continue;
        }

        amountCents = parseAmountString(amountStr);
        if (isNaN(amountCents)) {
          errors.push({ row: rowNum, message: `Could not parse amount: '${amountStr}'` });
          continue;
        }
        if (amountHints?.invertAmounts) {
          amountCents = -amountCents;
        }
      }

      // Parse description
      const description = row[mapping.description]?.trim();
      if (!description) {
        errors.push({ row: rowNum, message: "Missing description" });
        continue;
      }

      // Determine type from amount sign
      const type = amountCents > 0 ? "INCOME" : amountCents < 0 ? "EXPENSE" : "TRANSFER";

      transactions.push({
        date: date!,
        description,
        amount: amountCents,
        type,
        rawRow: row,
      });
    } catch (err) {
      errors.push({ row: rowNum, message: `Unexpected error: ${String(err)}` });
    }
  }

  return { transactions, errors };
}

function parseAmountString(str: string): number {
  let cleaned = str.replace(/[€$£\s]/g, "").trim();

  // US/international format: 4,232.00 or 1,000 (comma = thousands, period = decimal)
  if (/^\-?\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, "");
  }
  // European format: 1.234,56 (period = thousands, comma = decimal)
  else if (/^\-?\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  // Simple comma decimal: 123,45
  else if (/^\-?\d+(,\d{1,2})$/.test(cleaned)) {
    cleaned = cleaned.replace(",", ".");
  }

  const num = parseFloat(cleaned);
  return Math.round(num * 100);
}
