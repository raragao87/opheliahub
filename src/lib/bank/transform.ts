/**
 * Map Enable Banking transactions to the app's ParsedTransaction shape so the
 * existing import-commit pipeline can ingest them unchanged.
 */
import type { ParsedTransaction } from "@/lib/parsers/csv-parser";
import type { EnableBankingTx } from "./enable-banking";

/**
 * Convert one Enable Banking transaction. Returns null for non-booked rows
 * (pending entries are not part of the bank's settled balance).
 */
export function transformBankTransaction(tx: EnableBankingTx): ParsedTransaction | null {
  if (tx.status !== "BOOK") return null;

  // Amount magnitude comes from the payload; sign comes from the indicator —
  // never trust the raw amount's sign.
  const magnitude = Math.round(Math.abs(parseFloat(tx.transaction_amount.amount)) * 100);
  if (!Number.isFinite(magnitude)) return null;
  const amount = tx.credit_debit_indicator === "DBIT" ? -magnitude : magnitude;

  const description =
    (tx.remittance_information && tx.remittance_information.filter(Boolean).join(" ").trim()) ||
    tx.creditor?.name ||
    tx.debtor?.name ||
    "(no description)";

  const externalId = tx.entry_reference ?? tx.transaction_id;
  const dateStr = tx.booking_date ?? tx.value_date;
  if (!dateStr) return null;

  return {
    date: new Date(dateStr),
    description,
    amount,
    type: amount >= 0 ? "INCOME" : "EXPENSE",
    currency: tx.transaction_amount.currency,
    externalId,
  };
}

/** Transform a batch, dropping non-booked / unparseable rows. */
export function transformBankTransactions(txs: EnableBankingTx[]): ParsedTransaction[] {
  return txs
    .map(transformBankTransaction)
    .filter((t): t is ParsedTransaction => t !== null);
}
