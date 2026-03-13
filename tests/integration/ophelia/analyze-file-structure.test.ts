/**
 * Integration tests for analyzeFileStructure.
 *
 * These tests call the real MiniMax API and are skipped when MINIMAX_API_KEY
 * is not set, so they are safe to run in CI without credentials.
 *
 * To run locally:
 *   pnpm test tests/integration/ophelia/analyze-file-structure.test.ts
 * (MINIMAX_API_KEY is loaded automatically from .env.local by tests/setup.ts)
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import * as XLSX from "xlsx";

// ── Module mocks (hoisted by vitest before imports) ─────────────────────────

// server-only throws outside Next.js — mock it to a no-op
vi.mock("server-only", () => ({}));

// @/env validates DATABASE_URL etc. which aren't available in test env.
// Provide just what Ophelia needs.
vi.mock("@/env", () => ({
  env: {
    MINIMAX_API_KEY: process.env.MINIMAX_API_KEY,
    OPHELIA_ENABLED: true,
  },
}));

// ── Imports (resolved after mocks are registered) ───────────────────────────

import { analyzeFileStructure } from "@/lib/ophelia/analyzeFileStructure";
import type { FileStructureAnalysis } from "@/lib/ophelia/types";

// ── Fixture helpers ──────────────────────────────────────────────────────────

const FIXTURE_DIR = resolve(process.cwd(), "src/lib/ophelia/__tests__");

function readFixture(relativePath: string): string {
  return readFileSync(resolve(FIXTURE_DIR, relativePath), "utf-8");
}

/**
 * Reads an Excel file (.xls / .xlsx) from the fixtures dir and returns its
 * first sheet as a CSV string.
 *
 * When `skipToHeaderContaining` is provided, the function scans rows until it
 * finds one whose cells include that string, then discards all preceding
 * metadata rows. This handles bank statements (e.g. Amex) that prepend
 * several informational rows before the real column header.
 */
function excelFixtureToCsv(
  relativePath: string,
  skipToHeaderContaining?: string
): string {
  const wb = XLSX.readFile(resolve(FIXTURE_DIR, relativePath));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    defval: "",
  });

  let startRow = 0;
  if (skipToHeaderContaining) {
    const idx = rows.findIndex((r) =>
      r.some(
        (cell) =>
          typeof cell === "string" && cell.includes(skipToHeaderContaining)
      )
    );
    if (idx !== -1) startRow = idx;
  }

  return rows
    .slice(startRow)
    .map((r) =>
      r
        .map((c) => {
          const s = String(c);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(",")
    )
    .join("\n");
}

/** Returns the DetectedField for a given source column header, or undefined. */
function bySource(result: FileStructureAnalysis, col: string) {
  return result.detectedFields.find((f) => f.sourceColumn === col);
}

/** Returns the first DetectedField with a given mappedTo value, or undefined. */
function byMapped(result: FileStructureAnalysis, mapped: string) {
  return result.detectedFields.find((f) => f.mappedTo === mapped);
}

// ── Skip guard ───────────────────────────────────────────────────────────────

const HAS_API_KEY = !!process.env.MINIMAX_API_KEY;

describe.skipIf(!HAS_API_KEY)(
  "analyzeFileStructure — integration (requires MINIMAX_API_KEY)",
  () => {
    // ── eToro TSV ────────────────────────────────────────────────────────────

    describe("eToro TSV export", () => {
      it(
        "detects date, amount coverage, currency, and decimal separator",
        async () => {
          const rawContent = readFixture(
            "__fixtures__/eToroTransactions_01-01-2016_01-03-2026_117719.tsv"
          );

          const result = await analyzeFileStructure({
            rawContent,
            filename: "eToroTransactions_01-01-2016_01-03-2026_117719.tsv",
            delimiter: "\t",
          });

          expect(result).not.toBeNull();
          const r = result!;

          // Date column
          const dateField = bySource(r, "Date");
          expect(dateField?.mappedTo).toBe("date");

          // Date format should reflect DD/MM/YYYY (time part optional)
          expect(r.dateFormat).toMatch(/dd\/MM\/yyyy/);

          // Amount coverage: either "Amount" → amount, OR
          // "Money Out" → debit AND "Money In" → credit
          const hasAmount = bySource(r, "Amount")?.mappedTo === "amount";
          const hasDebitCredit =
            bySource(r, "Money Out")?.mappedTo === "debit" &&
            bySource(r, "Money In")?.mappedTo === "credit";
          expect(hasAmount || hasDebitCredit).toBe(true);

          // When using debit/credit split, Money Out values are negative
          // (e.g. -87.17), so signConvention must be "negative"
          if (hasDebitCredit) {
            expect(bySource(r, "Money Out")?.signConvention).toBe("negative");
          }

          // Currency column
          expect(bySource(r, "Currency")?.mappedTo).toBe("currency");

          // eToro uses period decimal separator (e.g. -87.17)
          expect(r.decimalSeparator).toBe(".");

          // First row is a header
          expect(r.hasHeaderRow).toBe(true);

          // Sample values sanity check: Date field should have date-like values
          expect(dateField?.sampleValues.length).toBeGreaterThan(0);
        },
        60_000
      );
    });

    // ── Revolut NL (Dutch) CSV ───────────────────────────────────────────────

    describe("Revolut NL CSV export (Dutch)", () => {
      it(
        "detects date (Startdatum), description (Beschrijving), amount (Bedrag), balance (Saldo), currency (Valuta)",
        async () => {
          const rawContent = readFixture(
            "__fixtures__/account-statement_2024-03-04_2026-03-01_nl-nl_9c7dda.csv"
          );

          const result = await analyzeFileStructure({
            rawContent,
            filename:
              "account-statement_2024-03-04_2026-03-01_nl-nl_9c7dda.csv",
            delimiter: ",",
          });

          expect(result).not.toBeNull();
          const r = result!;

          // Date: Startdatum or Datum voltooid maps to "date"
          const dateField = byMapped(r, "date");
          expect(dateField).toBeDefined();
          expect(["Startdatum", "Datum voltooid"]).toContain(
            dateField!.sourceColumn
          );

          // Date format: ISO-style with time (yyyy-MM-dd HH:mm:ss)
          expect(r.dateFormat).toMatch(/yyyy-MM-dd/);

          // Description: Beschrijving → description
          expect(bySource(r, "Beschrijving")?.mappedTo).toBe("description");

          // Amount: Bedrag → amount
          expect(bySource(r, "Bedrag")?.mappedTo).toBe("amount");

          // Currency: Valuta → currency
          expect(bySource(r, "Valuta")?.mappedTo).toBe("currency");

          // Balance: Saldo → balance
          expect(bySource(r, "Saldo")?.mappedTo).toBe("balance");

          // Revolut uses period decimal separator (e.g. 500.00)
          expect(r.decimalSeparator).toBe(".");

          // First row is a header
          expect(r.hasHeaderRow).toBe(true);
        },
        60_000
      );
    });

    // ── ABN AMRO XLS export ──────────────────────────────────────────────────

    describe("ABN AMRO XLS export (Dutch)", () => {
      it(
        "detects date (Transactiedatum), description (Omschrijving), amount (Transactiebedrag), currency (Muntsoort), balance (Eindsaldo)",
        async () => {
          // XLS is binary; convert to CSV via SheetJS first.
          // ABN AMRO has a clean header at row 1 — no metadata rows to skip.
          const rawContent = excelFixtureToCsv(
            "__fixtures__/XLS260301100918.xls"
          );

          const result = await analyzeFileStructure({
            rawContent,
            filename: "XLS260301100918.xls",
            delimiter: ",",
          });

          expect(result).not.toBeNull();
          const r = result!;

          // Date: Transactiedatum → date, compact numeric format yyyyMMdd
          expect(bySource(r, "Transactiedatum")?.mappedTo).toBe("date");
          expect(r.dateFormat).toMatch(/yyyyMMdd/);

          // Description: Omschrijving → description
          expect(bySource(r, "Omschrijving")?.mappedTo).toBe("description");

          // Amount: Transactiebedrag → amount (signed, e.g. -77.09)
          expect(bySource(r, "Transactiebedrag")?.mappedTo).toBe("amount");

          // Currency: Muntsoort → currency (contains "EUR")
          expect(bySource(r, "Muntsoort")?.mappedTo).toBe("currency");

          // Balance: Eindsaldo (ending balance) → balance
          expect(bySource(r, "Eindsaldo")?.mappedTo).toBe("balance");

          // ABN AMRO uses period decimal separator
          expect(r.decimalSeparator).toBe(".");

          // First row is a header
          expect(r.hasHeaderRow).toBe(true);
        },
        60_000
      );
    });

    // ── American Express XLSX export (Dutch) ─────────────────────────────────

    describe("American Express XLSX export (Dutch)", () => {
      it(
        "detects date (Datum), description (Omschrijving), amount (Bedrag), reference (Referentie)",
        async () => {
          // The Amex XLSX has 5 rows of metadata before the real header row.
          // Skip to the row that starts with "Datum" (the column header row).
          const rawContent = excelFixtureToCsv(
            "__fixtures__/activiteit.xlsx",
            "Datum" // skip metadata rows until header containing "Datum"
          );

          const result = await analyzeFileStructure({
            rawContent,
            filename: "activiteit.xlsx",
            delimiter: ",",
          });

          expect(result).not.toBeNull();
          const r = result!;

          // Date: Datum → date, US-style MM/dd/yyyy (e.g. 02/27/2026)
          expect(bySource(r, "Datum")?.mappedTo).toBe("date");
          expect(r.dateFormat).toMatch(/MM\/dd\/yyyy/);

          // Description: Omschrijving → description
          expect(bySource(r, "Omschrijving")?.mappedTo).toBe("description");

          // Amount: Bedrag → amount (signed, e.g. -16.14 for refund)
          expect(bySource(r, "Bedrag")?.mappedTo).toBe("amount");

          // Reference: Referentie → reference
          expect(bySource(r, "Referentie")?.mappedTo).toBe("reference");

          // Amex uses period decimal separator
          expect(r.decimalSeparator).toBe(".");

          // First row (after metadata skip) is a header
          expect(r.hasHeaderRow).toBe(true);
        },
        60_000
      );
    });
  }
);
