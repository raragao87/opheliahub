/**
 * All monetary values are stored as integers (cents) to avoid floating-point issues.
 * 12345 = €123.45
 */

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string, locale: string = "nl-NL"): Intl.NumberFormat {
  const key = `${locale}-${currency}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(key, formatter);
  }
  return formatter;
}

/** Convert cents integer to display string (e.g., 12345 -> "€123,45") */
export function formatMoney(cents: number, currency: string = "EUR", locale?: string): string {
  return getFormatter(currency, locale).format(cents / 100);
}

/** Convert a display amount to cents (e.g., 123.45 -> 12345) */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Convert cents to a decimal number (e.g., 12345 -> 123.45) */
export function fromCents(cents: number): number {
  return cents / 100;
}

/** Parse a string amount to cents, handling comma/period decimals */
export function parseToCents(value: string): number | null {
  if (!value || value.trim() === "") return null;

  // Remove currency symbols and whitespace
  let cleaned = value.replace(/[€$£\s]/g, "").trim();

  // Handle European format: 1.234,56 -> 1234.56
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  // Handle format with comma as decimal: 123,45
  else if (/^-?\d+(,\d{1,2})$/.test(cleaned)) {
    cleaned = cleaned.replace(",", ".");
  }

  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  return Math.round(num * 100);
}
