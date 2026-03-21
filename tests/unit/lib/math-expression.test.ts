import { describe, it, expect } from "vitest";
import { evaluateExpression } from "@/lib/math-expression";
import { toCents } from "@/lib/money";

describe("evaluateExpression", () => {
  // ── Delta mode ───────────────────────────────────────────────────────

  describe("delta mode (input starts with operator)", () => {
    it("adds to current value with +", () => {
      expect(evaluateExpression("+50", toCents(500))).toBe(toCents(550));
    });

    it("subtracts from current value with -", () => {
      expect(evaluateExpression("-5", toCents(500))).toBe(toCents(495));
    });

    it("multiplies current value with *", () => {
      expect(evaluateExpression("*2", toCents(200))).toBe(toCents(400));
    });

    it("divides current value with /", () => {
      expect(evaluateExpression("/4", toCents(200))).toBe(toCents(50));
    });

    it("returns currentCents on division by zero", () => {
      expect(evaluateExpression("/0", toCents(500))).toBe(toCents(500));
    });

    it("handles decimal delta operands", () => {
      expect(evaluateExpression("+0.50", toCents(10))).toBe(toCents(10.50));
    });

    it("returns 0 when delta operand is not a number", () => {
      expect(evaluateExpression("+abc", toCents(500))).toBe(0);
    });

    it("handles whitespace after operator", () => {
      expect(evaluateExpression("+ 50", toCents(500))).toBe(toCents(550));
    });
  });

  // ── Absolute expression mode ─────────────────────────────────────────

  describe("absolute expression mode", () => {
    it("evaluates addition", () => {
      expect(evaluateExpression("100+50+25", 0)).toBe(toCents(175));
    });

    it("evaluates with operator precedence (* before +)", () => {
      expect(evaluateExpression("100+50*2", 0)).toBe(toCents(200));
    });

    it("evaluates subtraction", () => {
      expect(evaluateExpression("100-30", 0)).toBe(toCents(70));
    });

    it("evaluates multiplication", () => {
      expect(evaluateExpression("25*4", 0)).toBe(toCents(100));
    });

    it("evaluates division", () => {
      expect(evaluateExpression("100/4", 0)).toBe(toCents(25));
    });

    it("evaluates mixed operations with precedence", () => {
      // 10 + 3 * 5 - 2 = 10 + 15 - 2 = 23
      expect(evaluateExpression("10+3*5-2", 0)).toBe(toCents(23));
    });

    it("evaluates decimal numbers in expression", () => {
      expect(evaluateExpression("12.50+7.50", 0)).toBe(toCents(20));
    });
  });

  // ── Plain number (replace) mode ──────────────────────────────────────

  describe("plain number replacement", () => {
    it("replaces current value with plain number", () => {
      expect(evaluateExpression("750", toCents(500))).toBe(toCents(750));
    });

    it("handles decimal plain number", () => {
      expect(evaluateExpression("12.34", toCents(500))).toBe(toCents(12.34));
    });

    it("handles zero as input", () => {
      expect(evaluateExpression("0", toCents(500))).toBe(0);
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("returns 0 for empty string", () => {
      expect(evaluateExpression("", toCents(500))).toBe(0);
    });

    it("returns 0 for whitespace-only string", () => {
      expect(evaluateExpression("   ", toCents(500))).toBe(0);
    });

    it("returns 0 for invalid input", () => {
      expect(evaluateExpression("abc", toCents(500))).toBe(0);
    });

    it("returns 0 for nonsense expression", () => {
      expect(evaluateExpression("abc+def", toCents(500))).toBe(0);
    });

    it("handles negative result from expression", () => {
      expect(evaluateExpression("10-20", 0)).toBe(toCents(-10));
    });

    it("handles leading/trailing whitespace", () => {
      expect(evaluateExpression("  750  ", toCents(500))).toBe(toCents(750));
    });

    it("handles single cent values", () => {
      expect(evaluateExpression("0.01", 0)).toBe(1);
    });

    it("handles large amounts", () => {
      expect(evaluateExpression("999999.99", 0)).toBe(99999999);
    });
  });
});
