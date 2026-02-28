import {
  endOfMonth,
  addMonths,
  addWeeks,
  addDays,
  addYears,
  differenceInMonths,
  differenceInWeeks,
  differenceInDays,
  differenceInYears,
  startOfMonth,
  subMonths,
} from "date-fns";

// ── Types ────────────────────────────────────────────────────────────

type RecurrenceFrequency =
  | "DAILY"
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY";

export type RecurringStatus = "PAID" | "PENDING" | "OVERDUE" | "INACTIVE";

interface RuleForComputation {
  startDate: Date;
  frequency: RecurrenceFrequency;
  totalInstallments: number | null;
  isActive: boolean;
}

interface RuleForMatching {
  accountId: string;
  amount: number; // cents (positive for income, negative for expense — stored as absolute in rule)
  description?: string | null;
  name: string;
}

interface TransactionForMatching {
  id: string;
  accountId: string;
  amount: number; // cents
  date: Date;
  description: string;
}

// ── Due-in-month computation ─────────────────────────────────────────

/**
 * Determines if a recurring rule is due in a given month.
 */
export function isRuleDueInMonth(
  rule: RuleForComputation,
  year: number,
  month: number
): boolean {
  if (!rule.isActive) return false;

  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);
  const ruleStart = new Date(rule.startDate);

  // Rule hasn't started yet
  if (ruleStart > monthEnd) return false;

  // Check if rule has expired (installments completed)
  if (rule.totalInstallments !== null) {
    const endDate = getEndDate(ruleStart, rule.frequency, rule.totalInstallments);
    if (endDate < monthStart) return false;
  }

  // Check frequency alignment
  const monthsDiff = differenceInMonths(monthStart, startOfMonth(ruleStart));

  switch (rule.frequency) {
    case "DAILY":
    case "WEEKLY":
    case "BIWEEKLY":
    case "MONTHLY":
      // At least one occurrence per month
      return true;

    case "QUARTERLY":
      // Every 3 months from startDate
      return monthsDiff % 3 === 0;

    case "YEARLY":
      // Same month as startDate
      return ruleStart.getMonth() === month - 1;
  }
}

/**
 * Returns the expected due date within a specific month.
 * Clamps the day-of-month to the month's last day (e.g., 31st → 28th in Feb).
 *
 * If `overrideDay` is provided (e.g., from `computeBestDueDay`), uses that
 * instead of the rule's startDate day — this allows dynamically correcting
 * due dates based on actual transaction history.
 */
export function getExpectedDueDate(
  rule: RuleForComputation,
  year: number,
  month: number,
  overrideDay?: number
): Date {
  const ruleDay = overrideDay ?? new Date(rule.startDate).getDate();
  const lastDay = endOfMonth(new Date(year, month - 1, 1)).getDate();
  const clampedDay = Math.min(ruleDay, lastDay);
  return new Date(year, month - 1, clampedDay);
}

/**
 * Computes the 1-indexed installment number for a given month.
 * Returns null if the rule is infinite (totalInstallments === null).
 */
export function getInstallmentNumber(
  rule: RuleForComputation,
  year: number,
  month: number
): number | null {
  if (rule.totalInstallments === null) return null;

  const ruleStart = new Date(rule.startDate);
  const targetMonth = new Date(year, month - 1, 1);

  let periodsElapsed: number;

  switch (rule.frequency) {
    case "DAILY":
      periodsElapsed = differenceInDays(targetMonth, ruleStart);
      break;
    case "WEEKLY":
      periodsElapsed = differenceInWeeks(targetMonth, ruleStart);
      break;
    case "BIWEEKLY":
      periodsElapsed = Math.floor(differenceInDays(targetMonth, ruleStart) / 14);
      break;
    case "MONTHLY":
      periodsElapsed = differenceInMonths(targetMonth, startOfMonth(ruleStart));
      break;
    case "QUARTERLY":
      periodsElapsed = Math.floor(
        differenceInMonths(targetMonth, startOfMonth(ruleStart)) / 3
      );
      break;
    case "YEARLY":
      periodsElapsed = differenceInYears(targetMonth, ruleStart);
      break;
  }

  // 1-indexed, clamped to totalInstallments
  const installment = Math.max(1, periodsElapsed + 1);
  return Math.min(installment, rule.totalInstallments);
}

// ── Due-day computation from historical transactions ─────────────────

/**
 * Computes the best day-of-month for a recurring payment by analyzing actual
 * transaction dates. Handles month-boundary payments (e.g. days 29-31 and 1-3
 * are all "around the 1st") using circular distance.
 *
 * For each candidate day (1-31), counts how many historical dates fall within
 * ±3 days (wrapping at month boundaries). Returns the day with the most matches,
 * preferring lower day numbers as a tiebreaker.
 */
export function computeBestDueDay(dates: Date[]): number {
  if (dates.length === 0) return 1;
  if (dates.length === 1) return dates[0].getDate();

  const days = dates.map((d) => d.getDate());

  let bestDay = days[0];
  let bestCount = 0;

  for (let candidate = 1; candidate <= 31; candidate++) {
    let count = 0;
    for (const day of days) {
      const diff = Math.abs(day - candidate);
      const wrappedDiff = Math.min(diff, 31 - diff);
      if (wrappedDiff <= 3) count++;
    }
    if (count > bestCount || (count === bestCount && candidate < bestDay)) {
      bestCount = count;
      bestDay = candidate;
    }
  }

  return bestDay;
}

// ── Status computation ───────────────────────────────────────────────

/**
 * Computes the status of a recurring rule for a given month.
 */
export function computeStatus(
  expectedDueDate: Date,
  hasMatch: boolean,
  currentDate: Date = new Date()
): RecurringStatus {
  if (hasMatch) return "PAID";
  if (expectedDueDate >= currentDate) return "PENDING";
  return "OVERDUE";
}

// ── Transaction matching ─────────────────────────────────────────────

/**
 * Finds the best matching transaction for a recurring rule.
 *
 * Matching criteria:
 * 1. Same accountId
 * 2. Date within ±4 days of expected due date (handles weekends)
 * 3. Amount within ±10% of expected amount
 * 4. Bonus: description similarity (case-insensitive substring)
 */
export function findMatchingTransaction(
  rule: RuleForMatching,
  expectedDueDate: Date,
  transactions: TransactionForMatching[]
): TransactionForMatching | null {
  const AMOUNT_TOLERANCE = 0.10; // ±10%
  const DATE_TOLERANCE_DAYS = 4; // ±4 days

  const dueDateMs = expectedDueDate.getTime();
  const dayMs = 86_400_000;
  const minDate = dueDateMs - DATE_TOLERANCE_DAYS * dayMs;
  const maxDate = dueDateMs + DATE_TOLERANCE_DAYS * dayMs;

  const expectedAmount = Math.abs(rule.amount);
  const minAmount = expectedAmount * (1 - AMOUNT_TOLERANCE);
  const maxAmount = expectedAmount * (1 + AMOUNT_TOLERANCE);

  // Normalize rule name/description for matching
  const ruleTerms = [
    rule.name.toLowerCase(),
    ...(rule.description ? [rule.description.toLowerCase()] : []),
  ];

  let bestMatch: TransactionForMatching | null = null;
  let bestScore = -1;

  for (const tx of transactions) {
    // 1. Account must match
    if (tx.accountId !== rule.accountId) continue;

    // 2. Date within tolerance
    const txDate = new Date(tx.date).getTime();
    if (txDate < minDate || txDate > maxDate) continue;

    // 3. Amount within tolerance
    const txAmount = Math.abs(tx.amount);
    if (txAmount < minAmount || txAmount > maxAmount) continue;

    // 4. Score by description similarity + amount closeness
    let score = 1; // base score for matching account + date + amount

    // Amount closeness bonus (0-1)
    const amountDiff = Math.abs(txAmount - expectedAmount) / expectedAmount;
    score += 1 - amountDiff;

    // Description similarity bonus
    const txDesc = tx.description.toLowerCase();
    for (const term of ruleTerms) {
      if (txDesc.includes(term) || term.includes(txDesc)) {
        score += 2; // strong bonus for description match
        break;
      }
    }

    // Date closeness bonus (0-1)
    const dateDiff = Math.abs(txDate - dueDateMs) / (DATE_TOLERANCE_DAYS * dayMs);
    score += 1 - dateDiff;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = tx;
    }
  }

  return bestMatch;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Computes the end date of a recurring rule with finite installments.
 */
function getEndDate(
  startDate: Date,
  frequency: RecurrenceFrequency,
  totalInstallments: number
): Date {
  const periods = totalInstallments - 1; // first installment is at startDate

  switch (frequency) {
    case "DAILY":
      return addDays(startDate, periods);
    case "WEEKLY":
      return addWeeks(startDate, periods);
    case "BIWEEKLY":
      return addWeeks(startDate, periods * 2);
    case "MONTHLY":
      return addMonths(startDate, periods);
    case "QUARTERLY":
      return addMonths(startDate, periods * 3);
    case "YEARLY":
      return addYears(startDate, periods);
  }
}

// ── Display name extraction ─────────────────────────────────────────

/** Strip IBANs (NL12ABCD0123456789), BIC codes, and long reference numbers */
function stripBankCodes(s: string): string {
  return s
    // IBANs: 2-letter country code + 2 check digits + up to 30 alphanumeric
    .replace(/\b[A-Z]{2}\d{2}[A-Z]{4}\d{4,}\b/gi, "")
    // BIC/SWIFT codes: 8 or 11 alphanumeric
    .replace(/\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?\b/g, "")
    // Mandate/reference IDs (long hex or alphanumeric codes)
    .replace(/\b[A-Z0-9]{10,}\b/g, "")
    // Clean up leftover whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/** Return the cleaned result or a truncated fallback */
function finalizeDisplayName(candidate: string, original: string): string {
  const cleaned = candidate.replace(/\s+/g, " ").trim();
  if (cleaned.length >= 2) return cleaned;
  // Fallback: truncated original
  const fallback = original.replace(/\s+/g, " ").trim();
  if (fallback.length <= 50) return fallback;
  return fallback.slice(0, 50) + "...";
}

/**
 * Extracts a clean, human-readable counterparty name from raw bank descriptions.
 * Handles common Dutch/EU SEPA bank description formats (ABN AMRO, ING, Rabobank,
 * Revolut, Bunq, etc.).
 */
export function extractDisplayName(description: string): string {
  const desc = description.trim();
  if (!desc) return "";

  // ── "Deposito aan" / "Opname van" (savings account transfers) ─────
  // Checked early because these are often short enough to pass the
  // "short & clean" check, but we want the account name extracted.
  const savingsMatch = desc.match(
    /(?:Deposito aan|Opname van)\s+'([^']+)'/i
  );
  if (savingsMatch) {
    return finalizeDisplayName(savingsMatch[1].trim(), desc);
  }

  // ── Short & clean already? Use as-is ──────────────────────────────
  // No SEPA field codes, no IBANs, no long digit sequences
  if (
    desc.length <= 40 &&
    !/\/[A-Z]{2,5}\//i.test(desc) &&
    !/\b[A-Z]{2}\d{2}[A-Z]{4}\d{4,}\b/i.test(desc) &&
    !/\d{10,}/.test(desc)
  ) {
    return desc;
  }

  // ── SEPA /NAME/ field (used by ABN AMRO, ING, Rabobank in MT940) ──
  // /TRTP/.../NAME/<counterparty>/MARF|REMI|IBAN|BIC|EREF/...
  const trpNameMatch = desc.match(
    /\/NAME\/(.+?)\/(?:MARF|REMI|IBAN|BIC|EREF|CSID|ULTD|ADDR|ISDT)\//i
  );
  if (trpNameMatch) {
    return finalizeDisplayName(trpNameMatch[1], desc);
  }
  // Simpler NAME extraction (at end of string, no following field code)
  const trpNameSimple = desc.match(/\/NAME\/([^/]+)/i);
  if (trpNameSimple) {
    return finalizeDisplayName(trpNameSimple[1], desc);
  }

  // ── "Naam:" field (ABN AMRO, ING, SEPA Incasso, SEPA iDEAL) ──────
  // ABN AMRO uses fixed-width padding (many spaces) between fields.
  // Name is terminated by 2+ spaces (field padding), newline, or end of string.
  const naamMatch = desc.match(/Naam:\s+(.+?)(?:\s{2,}|\n|$)/i);
  if (naamMatch) {
    return finalizeDisplayName(naamMatch[1].trim(), desc);
  }

  // ── "Overschrijving van/naar <name>" (ABN internal transfer) ──────
  const overschrijvingMatch = desc.match(
    /Overschrijving\s+(?:van|naar)\s+(.+)/i
  );
  if (overschrijvingMatch) {
    return finalizeDisplayName(overschrijvingMatch[1].trim(), desc);
  }

  // ── Rabobank "Naar <name>" / "Van <name>" format ──────────────────
  const raboMatch = desc.match(
    /(?:^|\s)(?:Naar|Van)\s+(.+?)(?:\s{2,}|\s+(?:IBAN|Kenmerk|Datum|Machtiging|Omschrijving):)/i
  );
  if (raboMatch) {
    return finalizeDisplayName(raboMatch[1], desc);
  }

  // ── ING "Betaalautomaat" / "Geldautomaat" (POS/ATM) format ───────
  // "Betaalautomaat 12:34 pas 123 ALBERT HEIJN 1234 AMSTERDAM"
  const posMatch = desc.match(
    /(?:Betaalautomaat|Geldautomaat)\s+\d{2}:\d{2}\s+pas\s+\d+\s+(.+)/i
  );
  if (posMatch) {
    // Strip trailing city by removing last word if it looks like a city (all caps)
    const raw = posMatch[1].trim();
    return finalizeDisplayName(
      raw.replace(/\s+[A-Z]{2,}$/, "").replace(/\s+\d+$/, ""),
      desc
    );
  }

  // ── ABN AMRO bank fees ────────────────────────────────────────────
  if (/^ABN AMRO Bank/i.test(desc)) return "ABN AMRO Bank";

  // ── ING bank interest / internal ──────────────────────────────────
  if (/^(ING Bank|ING BANK)/i.test(desc)) return "ING Bank";

  // ── Nettorente / Creditrente / interest descriptions ──────────────
  const interestMatch = desc.match(
    /^(Nettorente|Creditrente|Debetrente|Rente)\b/i
  );
  if (interestMatch) {
    return interestMatch[1].charAt(0).toUpperCase() + interestMatch[1].slice(1).toLowerCase();
  }

  // ── iDEAL payments: "iDEAL betaling aan <merchant>" ───────────────
  const idealMatch = desc.match(
    /iDEAL\s+(?:betaling\s+)?(?:aan|to)\s+(.+?)(?:\s+kenmerk|\s+omschrijving|\s+\d{10,}|$)/i
  );
  if (idealMatch) {
    return finalizeDisplayName(stripBankCodes(idealMatch[1]), desc);
  }

  // ── /REMI/ field (remittance info — sometimes has the useful part) ─
  const remiMatch = desc.match(
    /\/REMI\/(?:USTD\/\/)?(.*?)(?:\/EREF\/|\/CSID\/|\/IBAN\/|\/BIC\/|$)/i
  );
  if (remiMatch && remiMatch[1].trim().length > 2) {
    const remi = remiMatch[1].trim();
    // If REMI is short and clean, use it
    if (remi.length <= 60 && !/\b[A-Z]{2}\d{2}[A-Z]{4}\d{4,}\b/i.test(remi)) {
      return finalizeDisplayName(remi, desc);
    }
  }

  // ── Generic SEPA field-code cleanup fallback ──────────────────────
  // Strip all /FIELD/ codes and their typical content patterns
  const cleaned = desc
    .replace(/^\/TRTP\/[^/]+\//, "") // Remove transaction type
    .replace(/\/(?:CSID|MARF|EREF|REMI|IBAN|BIC|ADDR|ISDT|ULTD|NAME)\/[^/]*/gi, " ")
    .replace(/\/[A-Z]{2,5}\//g, " ") // Remaining field codes
    .replace(/\s+/g, " ")
    .trim();

  const strippedCleaned = stripBankCodes(cleaned);
  if (strippedCleaned.length >= 2) {
    return finalizeDisplayName(
      strippedCleaned.length <= 60
        ? strippedCleaned
        : strippedCleaned.slice(0, 50) + "...",
      desc
    );
  }

  // ── Ultimate fallback: truncated original ─────────────────────────
  if (desc.length <= 50) return desc;
  return desc.slice(0, 50) + "...";
}

// ── Recurring pattern detection ──────────────────────────────────────

export interface DetectedPattern {
  /** Normalized description used as group key */
  key: string;
  /** Best display name for the rule */
  name: string;
  /** Original description (for matching field) */
  description: string;
  /** Median amount in cents (absolute) */
  amount: number;
  /** Detected transaction type */
  type: "INCOME" | "EXPENSE";
  /** Detected frequency */
  frequency: RecurrenceFrequency;
  /** Account where these transactions occur */
  accountId: string;
  accountName: string;
  /** Category if all transactions share one */
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  /** First occurrence date (for startDate) */
  firstDate: Date;
  /** Number of occurrences found */
  occurrences: number;
  /** Average interval in days between occurrences */
  avgIntervalDays: number;
}

interface TransactionForDetection {
  id: string;
  description: string;
  amount: number;
  type: string;
  date: Date;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
}

/**
 * Normalizes a transaction description for grouping.
 * Handles common EU/SEPA bank description formats.
 */
function normalizeDescription(desc: string): string {
  let s = desc.toLowerCase().trim();

  // Strip common SEPA/bank prefixes
  s = s
    .replace(
      /^(pagamento\s+)?(sepa\s+)?(dd|ct|sdd|sct|direct\s+debit|trans[f]?\.?|transferencia|transferência|compra|purchase|payment|betaling|incasso|afschrijving)\s*/gi,
      ""
    )
    // Remove MB WAY / MBWAY prefixes
    .replace(/^(mb\s*way|multibanco|atm|pos|tpa)\s*/gi, "")
    // Remove card payment prefixes
    .replace(/^(visa|mastercard|maestro|cartão|card)\s*/gi, "");

  // Strip reference numbers (anywhere in the string)
  s = s
    .replace(/\b(ref|nr|no|mandate|mand|mandaat|mandato)[.:# ]?\s*\w{4,}\b/gi, "")
    // Remove dates anywhere: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, yyyy-mm-dd
    .replace(/\b\d{1,2}[\/\-\.]\d{1,2}([\/\-\.]\d{2,4})?\b/g, "")
    .replace(/\b\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}\b/g, "")
    // Remove standalone long numbers (6+ digits: reference codes, IDs)
    .replace(/\b\d{6,}\b/g, "")
    // Remove trailing month abbreviations with optional year
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b\.?\s*\d{0,4}/gi, "")
    // Remove country codes at end (NL, PT, IE, DE, etc.)
    .replace(/\s+[A-Z]{2}$/i, "")
    // Remove city names that often appear at end (common for card payments)
    .replace(/\s+(dublin|amsterdam|luxembourg|london|lisboa|porto)\s*$/gi, "");

  // Collapse whitespace and trim
  s = s.replace(/\s+/g, " ").trim();

  // Remove trailing punctuation/separators
  s = s.replace(/[\/\-\.\*,;:]+$/, "").trim();

  return s;
}

/**
 * Detects the most likely frequency from a sorted list of dates.
 * Uses median interval (more robust to outliers than mean).
 */
function detectFrequency(
  dates: Date[]
): { frequency: RecurrenceFrequency; avgDays: number } | null {
  if (dates.length < 2) return null;

  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    intervals.push(differenceInDays(dates[i], dates[i - 1]));
  }

  // Use median instead of mean (more robust to outliers like skipped months)
  const sorted = [...intervals].sort((a, b) => a - b);
  const medianDays = sorted[Math.floor(sorted.length / 2)];
  const avgDays = intervals.reduce((s, d) => s + d, 0) / intervals.length;

  // For consistency check, count how many intervals are "close" to the median
  // (within 50% of median). At least half should match.
  const closeCount = intervals.filter(
    (d) => Math.abs(d - medianDays) / Math.max(medianDays, 1) <= 0.5
  ).length;
  if (closeCount < intervals.length * 0.5) return null;

  // Map median interval to frequency (wider ranges to be more forgiving)
  if (medianDays >= 1 && medianDays <= 2)
    return { frequency: "DAILY", avgDays };
  if (medianDays >= 5 && medianDays <= 11)
    return { frequency: "WEEKLY", avgDays };
  if (medianDays >= 12 && medianDays <= 20)
    return { frequency: "BIWEEKLY", avgDays };
  if (medianDays >= 21 && medianDays <= 40)
    return { frequency: "MONTHLY", avgDays };
  if (medianDays >= 75 && medianDays <= 110)
    return { frequency: "QUARTERLY", avgDays };
  if (medianDays >= 330 && medianDays <= 400)
    return { frequency: "YEARLY", avgDays };

  return null;
}

/**
 * Tries to build a DetectedPattern from a group of transactions.
 * Returns null if the group doesn't qualify (too few, inconsistent, etc.).
 */
function tryBuildPattern(
  key: string,
  txs: TransactionForDetection[],
  label: string,
  minOccurrences: number
): DetectedPattern | null {
  if (txs.length < minOccurrences) return null;

  // Check amount consistency: all amounts within ±20% of median
  const amounts = txs.map((t) => Math.abs(t.amount)).sort((a, b) => a - b);
  const medianAmount = amounts[Math.floor(amounts.length / 2)];

  if (medianAmount === 0) return null;

  const amountsConsistent = amounts.every(
    (a) => Math.abs(a - medianAmount) / medianAmount <= 0.20
  );
  if (!amountsConsistent) return null;

  // Sort by date and detect frequency
  const sorted = [...txs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const dates = sorted.map((t) => new Date(t.date));

  const freq = detectFrequency(dates);
  if (!freq) return null;

  // Check if all transactions share the same category
  const categoryIds = new Set(txs.map((t) => t.categoryId));
  const sharedCategoryId = categoryIds.size === 1 ? txs[0].categoryId : null;

  // Extract a clean display name from the most recent description
  const mostRecent = sorted[sorted.length - 1];
  const displayName = extractDisplayName(mostRecent.description);

  // Use the most frequent day-of-month instead of the earliest date's day.
  // This handles cases where the first transaction was on an atypical day
  // (e.g., mid-month manual transfer vs. typical 1st-of-month direct debit).
  const bestDay = computeBestDueDay(dates);
  const earliest = dates[0];
  const lastDayOfMonth = endOfMonth(earliest).getDate();
  const clampedDay = Math.min(bestDay, lastDayOfMonth);
  const adjustedFirstDate = new Date(
    earliest.getFullYear(),
    earliest.getMonth(),
    clampedDay
  );

  return {
    key,
    name: displayName,
    description: mostRecent.description,
    amount: medianAmount,
    type: mostRecent.type as "INCOME" | "EXPENSE",
    frequency: freq.frequency,
    accountId: mostRecent.accountId,
    accountName: mostRecent.accountName,
    categoryId: sharedCategoryId,
    categoryName: sharedCategoryId ? mostRecent.categoryName : null,
    categoryIcon: sharedCategoryId ? mostRecent.categoryIcon : null,
    firstDate: adjustedFirstDate,
    occurrences: txs.length,
    avgIntervalDays: freq.avgDays,
  };
}

/**
 * Merges patterns that share the same counterparty name + account + type.
 * This handles price changes (trial → full, yearly adjustments) where the
 * same subscription appears as multiple patterns with different amounts.
 *
 * Strategy: group by (lowercase name, accountId, type). For each group,
 * keep the pattern whose most recent transaction is newest (i.e. the
 * current price), but sum all occurrences and use the earliest firstDate.
 */
function mergeRelatedPatterns(patterns: DetectedPattern[]): DetectedPattern[] {
  // Group by counterparty + account + type, but only merge patterns whose
  // amounts are within 2× of each other (to avoid merging genuinely different
  // recurring payments from the same counterparty, e.g. motorcycle tax vs car tax).
  const MERGE_AMOUNT_RATIO = 2;
  const groups = new Map<string, DetectedPattern[]>();

  for (const p of patterns) {
    const baseKey = `${p.name.toLowerCase()}::${p.accountId}::${p.type}`;

    // Try to find an existing group whose amount is close enough
    let merged = false;
    for (const [key, group] of groups) {
      if (!key.startsWith(baseKey + "::")) continue;
      const ratio = Math.max(group[0].amount, p.amount) /
                    Math.max(Math.min(group[0].amount, p.amount), 1);
      if (ratio <= MERGE_AMOUNT_RATIO) {
        group.push(p);
        merged = true;
        break;
      }
    }

    if (!merged) {
      // Create a new group keyed by amount bucket to separate distant amounts
      const amountKey = `${baseKey}::${p.amount}`;
      groups.set(amountKey, [p]);
    }
  }

  const result: DetectedPattern[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Sort by most occurrences first, then by most recent firstDate
    // The pattern with the most recent transactions likely has the current amount
    group.sort((a, b) => {
      // Prefer the one with higher occurrences
      if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
      // Tie-break: prefer newest firstDate (more recent pattern = current price)
      return b.firstDate.getTime() - a.firstDate.getTime();
    });

    const primary = { ...group[0] };

    // Merge in data from the other patterns
    for (let i = 1; i < group.length; i++) {
      const other = group[i];
      primary.occurrences += other.occurrences;
      // Use the earliest firstDate across all sub-patterns
      if (other.firstDate < primary.firstDate) {
        primary.firstDate = other.firstDate;
      }
      // If primary has no category but the other does, adopt it
      if (!primary.categoryId && other.categoryId) {
        primary.categoryId = other.categoryId;
        primary.categoryName = other.categoryName;
        primary.categoryIcon = other.categoryIcon;
      }
    }

    // Recompute average interval across the full date range
    const totalDays =
      (new Date().getTime() - primary.firstDate.getTime()) / 86_400_000;
    if (primary.occurrences > 1) {
      primary.avgIntervalDays = totalDays / (primary.occurrences - 1);
    }

    result.push(primary);
  }

  return result;
}

/**
 * Splits a group of transactions into sub-groups where amounts within each
 * sub-group are within ±20% of the sub-group's median. Uses greedy clustering
 * by sorting by amount and splitting when the gap exceeds 40%.
 *
 * Handles same-counterparty payments with distinct amounts (e.g. motorcycle
 * tax €12/mo vs car tax €56/mo from "Belastingdienst").
 */
function splitByAmountProximity(
  txs: TransactionForDetection[]
): TransactionForDetection[][] {
  if (txs.length === 0) return [];

  const sorted = [...txs].sort(
    (a, b) => Math.abs(a.amount) - Math.abs(b.amount)
  );

  const groups: TransactionForDetection[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const current = Math.abs(sorted[i].amount);
    const prevMedian = (() => {
      const grp = groups[groups.length - 1];
      const amounts = grp
        .map((t) => Math.abs(t.amount))
        .sort((a, b) => a - b);
      return amounts[Math.floor(amounts.length / 2)];
    })();

    // If current amount is within ±40% of the group's median, add to same group
    if (prevMedian > 0 && Math.abs(current - prevMedian) / prevMedian <= 0.4) {
      groups[groups.length - 1].push(sorted[i]);
    } else {
      groups.push([sorted[i]]);
    }
  }

  return groups;
}

/**
 * Analyzes transactions and detects recurring patterns using two strategies:
 *
 * Pass 1 — Description-based: groups by normalized description + account + type.
 *   Catches: "Netflix", "Spotify", "Gym Membership" etc. when bank descriptions
 *   are consistent after normalization.
 *
 * Pass 2 — Amount-based: groups by exact amount + account + type (ignoring description).
 *   Catches: recurring payments where bank descriptions vary each month but the amount
 *   stays the same (common with SEPA direct debits, rent, subscriptions).
 *
 * Results from both passes are merged, with description-based matches taking priority.
 */
export function detectRecurringPatterns(
  transactions: TransactionForDetection[]
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const usedTxIds = new Set<string>();

  // ── Pass 1: Description-based grouping ──
  const descGroups = new Map<
    string,
    { transactions: TransactionForDetection[]; normalized: string }
  >();

  for (const tx of transactions) {
    const norm = normalizeDescription(tx.description);
    if (norm.length < 2) continue;

    const key = `desc::${norm}::${tx.accountId}::${tx.type}`;
    const existing = descGroups.get(key);
    if (existing) {
      existing.transactions.push(tx);
    } else {
      descGroups.set(key, { transactions: [tx], normalized: norm });
    }
  }

  for (const [key, group] of descGroups) {
    // 2 occurrences minimum for description-based (description match is strong signal)
    const pattern = tryBuildPattern(key, group.transactions, group.normalized, 2);
    if (pattern) {
      patterns.push(pattern);
      for (const tx of group.transactions) usedTxIds.add(tx.id);
    } else if (group.transactions.length >= 4) {
      // The group was rejected (likely inconsistent amounts). Try splitting
      // into amount-based sub-groups to handle cases like motorcycle tax vs
      // car tax from the same counterparty (same description, different amounts).
      const subGroups = splitByAmountProximity(group.transactions);
      for (const [subIdx, subTxs] of subGroups.entries()) {
        const subKey = `${key}::amt${subIdx}`;
        const subPattern = tryBuildPattern(subKey, subTxs, group.normalized, 2);
        if (subPattern) {
          patterns.push(subPattern);
          for (const tx of subTxs) usedTxIds.add(tx.id);
        }
      }
    }
  }

  // ── Pass 2: Amount-based grouping (catches varying descriptions) ──
  const amtGroups = new Map<string, TransactionForDetection[]>();

  for (const tx of transactions) {
    if (usedTxIds.has(tx.id)) continue; // Skip transactions already matched in pass 1

    const absAmount = Math.abs(tx.amount);
    // Only group amounts ≥ €1.00 (skip tiny amounts that are likely fees, rounding, etc.)
    if (absAmount < 100) continue;

    const key = `amt::${absAmount}::${tx.accountId}::${tx.type}`;
    const existing = amtGroups.get(key);
    if (existing) {
      existing.push(tx);
    } else {
      amtGroups.set(key, [tx]);
    }
  }

  for (const [key, txs] of amtGroups) {
    // 3 occurrences minimum for amount-based (weaker signal without description match)
    const mostRecent = txs.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )[0];
    const label = normalizeDescription(mostRecent.description) || mostRecent.description;
    const pattern = tryBuildPattern(key, txs, label, 3);
    if (pattern) {
      patterns.push(pattern);
    }
  }

  // ── Merge patterns from the same counterparty ──
  // When a subscription changes price (trial → full, yearly adjustment), the
  // same counterparty appears as separate patterns with different amounts.
  // Merge them: keep the most recent amount, combine occurrences.
  const merged = mergeRelatedPatterns(patterns);

  // Sort by occurrences (most frequent first), then by amount (largest first)
  merged.sort((a, b) => {
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    return b.amount - a.amount;
  });

  return merged;
}

/**
 * Computes the next due date from a given start date and frequency.
 * Used when creating/updating rules.
 */
export function computeNextDueDate(
  startDate: Date,
  frequency: RecurrenceFrequency
): Date {
  const now = new Date();
  let candidate = new Date(startDate);

  // Advance candidate until it's in the future
  while (candidate <= now) {
    switch (frequency) {
      case "DAILY":
        candidate = addDays(candidate, 1);
        break;
      case "WEEKLY":
        candidate = addWeeks(candidate, 1);
        break;
      case "BIWEEKLY":
        candidate = addWeeks(candidate, 2);
        break;
      case "MONTHLY":
        candidate = addMonths(candidate, 1);
        break;
      case "QUARTERLY":
        candidate = addMonths(candidate, 3);
        break;
      case "YEARLY":
        candidate = addYears(candidate, 1);
        break;
    }
  }

  return candidate;
}
