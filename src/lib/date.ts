import { format, parseISO, subMonths, addMonths } from "date-fns";

/**
 * Business timezone for month bucketing. The app's users are in the Netherlands
 * and dates are entered/displayed in Amsterdam local time, so budget months must
 * be bucketed in this zone — NOT the server's zone (Vercel runs in UTC).
 *
 * Why this matters: a CSV imported in the browser stores "01-06-2026" as
 * Amsterdam-local midnight = 2026-05-31T22:00:00Z. If the tracker computed June
 * as starting at UTC midnight (2026-06-01T00:00:00Z), that transaction would fall
 * into May. Pinning the range to Europe/Amsterdam makes bucketing independent of
 * where the server runs and matches how dates are shown.
 */
export const APP_TIME_ZONE = "Europe/Amsterdam";

export function formatDate(date: Date | string, pattern: string = "dd MMM yyyy"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, pattern);
}

export function formatShortDate(date: Date | string): string {
  return formatDate(date, "dd MMM");
}

/**
 * Milliseconds to add to a UTC instant to get the wall-clock time in `tz`.
 * Positive east of UTC (Amsterdam is +1h in winter, +2h in summer).
 */
function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
  return asUtc - instant.getTime();
}

/**
 * UTC instant corresponding to midnight (00:00:00.000) of the given calendar day
 * in `tz`, DST-correct. `monthIndex` is 0-based; Date.UTC handles overflow
 * (e.g. monthIndex 12 → January of next year).
 */
function zonedMidnightToUtc(year: number, monthIndex: number, day: number, tz: string): Date {
  const utcGuess = Date.UTC(year, monthIndex, day, 0, 0, 0, 0);
  // The 1st of a month is never within a DST transition window (those occur on
  // the last Sunday of Mar/Oct at 02:00/03:00), so a single offset lookup at the
  // guess instant is sufficient.
  const offset = tzOffsetMs(new Date(utcGuess), tz);
  return new Date(utcGuess - offset);
}

/**
 * Inclusive [start, end] range for a calendar month, pinned to `tz`.
 * `month` is 1-based. `end` is the last millisecond of the month, so it pairs
 * with Prisma `{ gte: start, lte: end }`.
 */
export function getMonthRange(year: number, month: number, tz: string = APP_TIME_ZONE) {
  const start = zonedMidnightToUtc(year, month - 1, 1, tz);
  const startOfNextMonth = zonedMidnightToUtc(year, month, 1, tz);
  const end = new Date(startOfNextMonth.getTime() - 1);
  return { start, end };
}

export function getPreviousMonth(year: number, month: number) {
  const date = subMonths(new Date(year, month - 1, 1), 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function getNextMonth(year: number, month: number) {
  const date = addMonths(new Date(year, month - 1, 1), 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function getCurrentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}
