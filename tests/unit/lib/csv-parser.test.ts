import { describe, it, expect } from "vitest";
import { parseCsvFile, transformCsvToTransactions } from "@/lib/parsers/csv-parser";

const MAPPING = { date: "Datum", description: "Beschrijving", amount: "Bedrag" };

describe("transformCsvToTransactions — non-settled status filtering", () => {
  it("skips reverted and pending rows (Revolut style)", () => {
    const csv = [
      "Datum,Beschrijving,Bedrag,Status",
      "2026-06-01,Albert Heijn,-10.00,VOLTOOID",
      "2026-06-02,Grab,-5.00,ONGEDAAN GEMAAKT",
      "2026-06-03,Vomar,-7.50,VOLTOOID",
      "2026-06-04,Bolt,-3.00,IN BEHANDELING",
    ].join("\n");
    const { rows } = parseCsvFile(csv);
    const result = transformCsvToTransactions(rows, MAPPING, "yyyy-MM-dd");

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions.map((t) => t.description)).toEqual(["Albert Heijn", "Vomar"]);
    // Skipped rows are reported so the user sees why counts differ
    expect(result.errors.some((e) => e.message.includes("ONGEDAAN GEMAAKT"))).toBe(true);
    expect(result.errors.some((e) => e.message.includes("IN BEHANDELING"))).toBe(true);
  });

  it("skips English status values too", () => {
    const csv = [
      "Datum,Beschrijving,Bedrag,Status",
      "2026-06-01,Shop A,-10.00,COMPLETED",
      "2026-06-02,Shop B,-5.00,REVERTED",
      "2026-06-03,Shop C,-2.00,DECLINED",
    ].join("\n");
    const { rows } = parseCsvFile(csv);
    const result = transformCsvToTransactions(rows, MAPPING, "yyyy-MM-dd");
    expect(result.transactions.map((t) => t.description)).toEqual(["Shop A"]);
  });

  it("leaves files without a status column untouched", () => {
    const csv = [
      "Datum,Beschrijving,Bedrag",
      "2026-06-01,Shop A,-10.00",
      "2026-06-02,Shop B,-5.00",
    ].join("\n");
    const { rows } = parseCsvFile(csv);
    const result = transformCsvToTransactions(rows, MAPPING, "yyyy-MM-dd");
    expect(result.transactions).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it("does not skip rows with unrecognized status values", () => {
    const csv = [
      "Datum,Beschrijving,Bedrag,Status",
      "2026-06-01,Shop A,-10.00,BOOKED",
      "2026-06-02,Shop B,-5.00,SETTLED",
    ].join("\n");
    const { rows } = parseCsvFile(csv);
    const result = transformCsvToTransactions(rows, MAPPING, "yyyy-MM-dd");
    expect(result.transactions).toHaveLength(2);
  });
});
