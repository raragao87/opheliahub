/**
 * Shared description matching for duplicate detection.
 *
 * Banks render the same transaction differently between exports — ABN AMRO
 * exports a pending transfer as "/TRTP/SEPA OVERBOEKING/IBAN/NL32REVO…" and
 * the same transaction later as "SEPA Overboeking    IBAN: NL32REVO…".
 * Prefix comparison alone misses these, so we also compare counterparty IBANs.
 */

// 2-letter country + 2 check digits + 11–30 alphanumeric BBAN. Word-bounded so
// the IBAN doesn't glue to an adjacent "BIC"/slash. Handles both Dutch IBANs
// (4-letter bank code: NL32REVO…) and all-numeric ones (Belgian BE32905…).
const IBAN_REGEX = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;

/** Extract all IBANs from a transaction description (normalized, deduped). */
export function extractIbans(description: string): string[] {
  // Keep delimiters (don't strip whitespace) so \b boundaries work.
  const matches = description.toUpperCase().match(IBAN_REGEX);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Do two descriptions plausibly refer to the same transaction?
 * True when either:
 * - the first 20 lowercase characters of one contain the other (legacy check), or
 * - both contain at least one IBAN and they share one (format-change tolerant)
 */
export function descriptionsMatch(a: string, b: string): boolean {
  const prefixA = a.toLowerCase().slice(0, 20);
  const prefixB = b.toLowerCase().slice(0, 20);
  if (prefixA.includes(prefixB) || prefixB.includes(prefixA)) return true;

  const ibansA = extractIbans(a);
  if (ibansA.length === 0) return false;
  const ibansB = extractIbans(b);
  return ibansA.some((iban) => ibansB.includes(iban));
}
