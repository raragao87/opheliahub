/**
 * MT940 (SWIFT) bank statement parser.
 * Parses MT940/MT942 files used by Dutch and European banks.
 *
 * MT940 structure:
 * :20: Transaction Reference
 * :25: Account Identification
 * :28C: Statement Number/Sequence
 * :60F: Opening Balance
 * :61: Statement Line (transaction)
 * :86: Information to Account Owner (transaction description)
 * :62F: Closing Balance
 */

export interface MT940Transaction {
  date: Date;
  description: string;
  amount: number; // cents, signed
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  reference?: string;
}

export interface MT940ParseResult {
  transactions: MT940Transaction[];
  accountId?: string;
  openingBalance?: number;
  closingBalance?: number;
  errors: string[];
}

export function parseMT940(content: string): MT940ParseResult {
  const transactions: MT940Transaction[] = [];
  const errors: string[] = [];
  let accountId: string | undefined;
  let openingBalance: number | undefined;
  let closingBalance: number | undefined;

  const lines = content.split(/\r?\n/);
  let currentTransaction: Partial<MT940Transaction> | null = null;
  let collectingDescription = false;
  let descriptionLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Account identification
    if (line.startsWith(":25:")) {
      accountId = line.substring(4).trim();
      continue;
    }

    // Opening balance
    if (line.startsWith(":60F:") || line.startsWith(":60M:")) {
      openingBalance = parseBalanceLine(line.substring(5));
      continue;
    }

    // Closing balance
    if (line.startsWith(":62F:") || line.startsWith(":62M:")) {
      closingBalance = parseBalanceLine(line.substring(5));
      continue;
    }

    // Statement line (transaction)
    if (line.startsWith(":61:")) {
      // Finalize previous transaction
      if (currentTransaction && collectingDescription) {
        finalizeTransaction(currentTransaction, descriptionLines, transactions);
      }

      currentTransaction = parseStatementLine(line.substring(4));
      collectingDescription = false;
      descriptionLines = [];

      if (!currentTransaction) {
        errors.push(`Line ${i + 1}: Could not parse transaction line`);
      }
      continue;
    }

    // Description
    if (line.startsWith(":86:")) {
      collectingDescription = true;
      descriptionLines = [line.substring(4).trim()];
      continue;
    }

    // Continuation of description (lines not starting with :XX:)
    if (collectingDescription && !line.startsWith(":") && line.trim()) {
      descriptionLines.push(line.trim());
      continue;
    }

    // End of description block
    if (collectingDescription && (line.startsWith(":") || line.trim() === "")) {
      if (currentTransaction) {
        finalizeTransaction(currentTransaction, descriptionLines, transactions);
        currentTransaction = null;
      }
      collectingDescription = false;
      descriptionLines = [];

      // Re-process this line
      if (line.startsWith(":61:")) {
        currentTransaction = parseStatementLine(line.substring(4));
        if (!currentTransaction) {
          errors.push(`Line ${i + 1}: Could not parse transaction line`);
        }
      }
    }
  }

  // Finalize last transaction
  if (currentTransaction) {
    finalizeTransaction(currentTransaction, descriptionLines, transactions);
  }

  return { transactions, accountId, openingBalance, closingBalance, errors };
}

function parseStatementLine(line: string): Partial<MT940Transaction> | null {
  // Format: YYMMDD[MMDD]DC[amount]
  // Example: 2401150115D000000012345N123NONREF
  try {
    // Date: YYMMDD
    const yearStr = line.substring(0, 2);
    const monthStr = line.substring(2, 4);
    const dayStr = line.substring(4, 6);
    const year = 2000 + parseInt(yearStr);
    const month = parseInt(monthStr) - 1;
    const day = parseInt(dayStr);
    const date = new Date(year, month, day);

    if (isNaN(date.getTime())) return null;

    // Skip optional booking date (4 chars) — detect by checking if next char is D or C
    let offset = 6;
    // If chars at 6-9 look like a date (4 digits), skip them
    if (/^\d{4}/.test(line.substring(6))) {
      offset = 10;
    }

    // Debit/Credit indicator
    const dcIndicator = line.substring(offset, offset + 2);
    let isDebit: boolean;
    if (dcIndicator.startsWith("D") || dcIndicator.startsWith("RD")) {
      isDebit = true;
      offset += dcIndicator.startsWith("RD") ? 2 : 1;
    } else if (dcIndicator.startsWith("C") || dcIndicator.startsWith("RC")) {
      isDebit = false;
      offset += dcIndicator.startsWith("RC") ? 2 : 1;
    } else {
      return null;
    }

    // Amount: digits with comma as decimal separator
    const amountMatch = line.substring(offset).match(/^(\d+,\d{0,2})/);
    if (!amountMatch) return null;

    const amountStr = amountMatch[1].replace(",", ".");
    const amount = Math.round(parseFloat(amountStr) * 100);
    const signedAmount = isDebit ? -amount : amount;

    // Reference (after amount)
    offset += amountMatch[0].length;
    const reference = line.substring(offset).replace(/^[A-Z]\d*/, "").trim();

    return {
      date,
      amount: signedAmount,
      type: isDebit ? "EXPENSE" : "INCOME",
      reference: reference || undefined,
    };
  } catch {
    return null;
  }
}

function parseBalanceLine(line: string): number {
  // Format: D/CYYMMDDCURRENCY[amount]
  // Example: C240115EUR000000123456,78
  try {
    const isDebit = line.startsWith("D");
    // Skip D/C (1) + date (6) + currency (3)
    const amountStr = line.substring(10).replace(",", ".");
    const amount = Math.round(parseFloat(amountStr) * 100);
    return isDebit ? -amount : amount;
  } catch {
    return 0;
  }
}

function finalizeTransaction(
  partial: Partial<MT940Transaction>,
  descLines: string[],
  transactions: MT940Transaction[]
) {
  if (!partial.date || partial.amount === undefined) return;

  const description = descLines.join(" ").trim() || partial.reference || "Unknown";

  transactions.push({
    date: partial.date,
    description,
    amount: partial.amount,
    type: partial.type ?? (partial.amount >= 0 ? "INCOME" : "EXPENSE"),
    reference: partial.reference,
  });
}
