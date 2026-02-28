import { format, parseISO, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";

export function formatDate(date: Date | string, pattern: string = "dd MMM yyyy"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, pattern);
}

export function formatShortDate(date: Date | string): string {
  return formatDate(date, "dd MMM");
}

export function getMonthRange(year: number, month: number) {
  const date = new Date(year, month - 1, 1);
  return {
    start: startOfMonth(date),
    end: endOfMonth(date),
  };
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
