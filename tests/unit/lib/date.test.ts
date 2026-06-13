import { describe, it, expect } from "vitest";
import { getMonthRange } from "@/lib/date";

/**
 * Regression tests for the production bug where some June transactions were
 * counted in May and some May transactions were missing from May. Root cause:
 * month boundaries were computed in the server timezone (UTC on Vercel), but
 * CSV-imported dates are stored at Amsterdam-local midnight (e.g. June 1 →
 * 2026-05-31T22:00:00Z). The boundary must be pinned to Europe/Amsterdam.
 */
describe("getMonthRange — Amsterdam-pinned month boundaries", () => {
  it("starts June 2026 at Amsterdam midnight (CEST, UTC+2)", () => {
    const { start, end } = getMonthRange(2026, 6);
    expect(start.toISOString()).toBe("2026-05-31T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-30T21:59:59.999Z");
  });

  it("handles winter DST offset (January 2026, CET, UTC+1)", () => {
    const { start, end } = getMonthRange(2026, 1);
    expect(start.toISOString()).toBe("2025-12-31T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-31T22:59:59.999Z");
  });

  it("rolls over the year at December", () => {
    const { end } = getMonthRange(2026, 12);
    expect(end.toISOString()).toBe("2026-12-31T22:59:59.999Z");
  });

  const inRange = (d: string, y: number, m: number) => {
    const { start, end } = getMonthRange(y, m);
    const t = new Date(d).getTime();
    return t >= start.getTime() && t <= end.getTime();
  };

  it("buckets a CSV-imported June 1 (Amsterdam midnight) into June, not May", () => {
    // Browser-parsed "01-06-2026" in Amsterdam → 2026-05-31T22:00:00Z
    const csvJune1 = "2026-05-31T22:00:00.000Z";
    expect(inRange(csvJune1, 2026, 6)).toBe(true);
    expect(inRange(csvJune1, 2026, 5)).toBe(false);
  });

  it("buckets a CSV-imported May 1 (Amsterdam midnight) into May, not April", () => {
    const csvMay1 = "2026-04-30T22:00:00.000Z";
    expect(inRange(csvMay1, 2026, 5)).toBe(true);
    expect(inRange(csvMay1, 2026, 4)).toBe(false);
  });

  it("buckets a bank-synced June 1 (UTC midnight) into June", () => {
    const bankJune1 = "2026-06-01T00:00:00.000Z";
    expect(inRange(bankJune1, 2026, 6)).toBe(true);
    expect(inRange(bankJune1, 2026, 5)).toBe(false);
  });

  it("buckets a manually-edited June 1 (noon Amsterdam) into June", () => {
    // inline-date-edit stores `new Date("2026-06-01T12:00:00")` (local) → 10:00Z
    const manualJune1 = "2026-06-01T10:00:00.000Z";
    expect(inRange(manualJune1, 2026, 6)).toBe(true);
  });

  it("keeps a true end-of-May transaction in May", () => {
    const may31Bank = "2026-05-31T00:00:00.000Z";
    expect(inRange(may31Bank, 2026, 5)).toBe(true);
    expect(inRange(may31Bank, 2026, 6)).toBe(false);
  });
});
