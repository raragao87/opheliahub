import { describe, it, expect } from "vitest";
import { transformBankTransaction, transformBankTransactions } from "@/lib/bank/transform";
import type { EnableBankingTx } from "@/lib/bank/enable-banking";

function tx(overrides: Partial<EnableBankingTx> = {}): EnableBankingTx {
  return {
    transaction_amount: { amount: "10.00", currency: "EUR" },
    credit_debit_indicator: "DBIT",
    status: "BOOK",
    booking_date: "2026-06-10",
    remittance_information: ["Albert Heijn"],
    ...overrides,
  };
}

describe("transformBankTransaction", () => {
  it("returns null for pending (non-booked) rows", () => {
    expect(transformBankTransaction(tx({ status: "PDNG" }))).toBeNull();
  });

  it("DBIT becomes a negative expense", () => {
    const r = transformBankTransaction(tx({ credit_debit_indicator: "DBIT" }))!;
    expect(r.amount).toBe(-1000);
    expect(r.type).toBe("EXPENSE");
  });

  it("CRDT becomes a positive income, regardless of raw amount sign", () => {
    const r = transformBankTransaction(
      tx({ credit_debit_indicator: "CRDT", transaction_amount: { amount: "-50.00", currency: "EUR" } })
    )!;
    expect(r.amount).toBe(5000);
    expect(r.type).toBe("INCOME");
  });

  it("prefers entry_reference over transaction_id for externalId", () => {
    const r = transformBankTransaction(tx({ entry_reference: "ENTRY-1", transaction_id: "TXN-1" }))!;
    expect(r.externalId).toBe("ENTRY-1");
  });

  it("falls back to transaction_id when entry_reference absent", () => {
    const r = transformBankTransaction(tx({ entry_reference: undefined, transaction_id: "TXN-9" }))!;
    expect(r.externalId).toBe("TXN-9");
  });

  it("builds description from remittance, falling back to creditor/debtor name", () => {
    expect(transformBankTransaction(tx({ remittance_information: ["Vomar", "ref 123"] }))!.description).toBe("Vomar ref 123");
    expect(
      transformBankTransaction(tx({ remittance_information: undefined, creditor: { name: "Gemeente Diemen" } }))!.description
    ).toBe("Gemeente Diemen");
  });

  it("rounds cents correctly", () => {
    expect(transformBankTransaction(tx({ transaction_amount: { amount: "33.335", currency: "EUR" } }))!.amount).toBe(-3334);
  });

  it("uses value_date when booking_date missing, null when neither", () => {
    expect(transformBankTransaction(tx({ booking_date: undefined, value_date: "2026-06-01" }))!.date.getFullYear()).toBe(2026);
    expect(transformBankTransaction(tx({ booking_date: undefined, value_date: undefined }))).toBeNull();
  });

  it("prefers transaction_date over a later booking/value date (weekend settlement)", () => {
    // Transfer made Sat Jun 13 but booked/valued Mon Jun 15 — should date Jun 13.
    const result = transformBankTransaction(
      tx({ transaction_date: "2026-06-13", booking_date: "2026-06-15", value_date: "2026-06-15" }),
    )!;
    expect(result.date.toISOString().slice(0, 10)).toBe("2026-06-13");
  });
});

describe("transformBankTransactions", () => {
  it("drops non-booked rows from a batch", () => {
    const out = transformBankTransactions([tx(), tx({ status: "PDNG" }), tx({ credit_debit_indicator: "CRDT" })]);
    expect(out).toHaveLength(2);
  });
});
