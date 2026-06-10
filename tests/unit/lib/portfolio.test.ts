import { describe, it, expect } from "vitest";
import {
  computePosition,
  valuePosition,
  microRateToFloat,
  type TradeRow,
} from "@/lib/finance/portfolio";

function buy(quantity: number, unitPrice: number, opts: Partial<TradeRow> = {}): TradeRow {
  return {
    date: opts.date ?? new Date("2026-01-01"),
    quantity,
    unitPrice,
    purchaseFxRate: opts.purchaseFxRate ?? null,
    feeAmount: opts.feeAmount ?? null,
  };
}

function sell(quantity: number, unitPrice: number, opts: Partial<TradeRow> = {}): TradeRow {
  return buy(-quantity, unitPrice, opts);
}

describe("microRateToFloat", () => {
  it("converts micro-rate Int to float", () => {
    expect(microRateToFloat(1084200)).toBeCloseTo(1.0842, 10);
    expect(microRateToFloat(1_000_000)).toBe(1);
  });
});

describe("computePosition", () => {
  // ── Buys ─────────────────────────────────────────────────────────────

  it("single EUR buy", () => {
    const pos = computePosition([buy(10, 100)]);
    expect(pos.quantity).toBe(10);
    expect(pos.avgCostLocal).toBe(100);
    expect(pos.costBasisLocal).toBe(1000);
    expect(pos.costBasisEur).toBe(1000);
    expect(pos.warnings).toEqual([]);
  });

  it("multiple buys produce the weighted average cost", () => {
    const pos = computePosition([buy(10, 100), buy(10, 200)]);
    expect(pos.quantity).toBe(20);
    expect(pos.avgCostLocal).toBe(150);
    expect(pos.costBasisLocal).toBe(3000);
  });

  it("includes fees in the cost basis", () => {
    const pos = computePosition([buy(10, 100, { feeAmount: 50 })]);
    expect(pos.costBasisLocal).toBe(1050);
    expect(pos.avgCostLocal).toBe(105);
  });

  // ── Sells ────────────────────────────────────────────────────────────

  it("partial sell reduces both pools proportionally, avg cost unchanged", () => {
    const pos = computePosition([
      buy(10, 100, { purchaseFxRate: 1.25 }),
      sell(4, 180),
    ]);
    expect(pos.quantity).toBe(6);
    expect(pos.avgCostLocal).toBe(100);
    expect(pos.costBasisLocal).toBe(600);
    expect(pos.costBasisEur).toBeCloseTo(600 / 1.25, 8);
  });

  it("full sell closes the position cleanly", () => {
    const pos = computePosition([buy(10, 100), sell(10, 150)]);
    expect(pos.quantity).toBe(0);
    expect(pos.costBasisLocal).toBe(0);
    expect(pos.costBasisEur).toBe(0);
    expect(pos.avgCostLocal).toBe(0);
  });

  it("oversell clamps to zero and warns instead of throwing", () => {
    const pos = computePosition([buy(5, 100), sell(8, 100)]);
    expect(pos.quantity).toBe(0);
    expect(pos.warnings).toContain("OVERSOLD");
  });

  it("two buys at different FX rates then a partial sell keep the EUR pool blended", () => {
    // 10 @ 100 USD with 1 EUR = 1.00 USD → 1000 EUR
    // 10 @ 100 USD with 1 EUR = 1.25 USD → 800 EUR
    const pos = computePosition([
      buy(10, 100, { purchaseFxRate: 1.0 }),
      buy(10, 100, { purchaseFxRate: 1.25 }),
      sell(10, 120),
    ]);
    expect(pos.quantity).toBe(10);
    // Half of each pool remains: local 1000, EUR (1000 + 800) / 2 = 900
    expect(pos.costBasisLocal).toBe(1000);
    expect(pos.costBasisEur).toBeCloseTo(900, 8);
  });

  it("null purchaseFxRate falls back to 1:1 without crashing", () => {
    const pos = computePosition([buy(3, 50, { purchaseFxRate: null })]);
    expect(pos.costBasisEur).toBe(150);
  });
});

describe("valuePosition", () => {
  it("EUR asset: gain is purely local, fx gain is zero", () => {
    const pos = computePosition([buy(10, 100)]);
    const v = valuePosition(pos, 120, 1);
    expect(v.valueEurCents).toBe(120000);
    expect(v.costEurCents).toBe(100000);
    expect(v.unrealizedGainEurCents).toBe(20000);
    expect(v.localGainEurCents).toBe(20000);
    expect(v.fxGainEurCents).toBe(0);
    expect(v.returnPct).toBeCloseTo(0.2, 10);
  });

  it("USD asset with unchanged FX: fx gain is zero", () => {
    const pos = computePosition([buy(10, 100, { purchaseFxRate: 1.1 })]);
    const v = valuePosition(pos, 120, 1.1);
    expect(v.fxGainEurCents).toBe(0);
    expect(v.localGainEurCents).toBe(v.unrealizedGainEurCents);
  });

  it("USD asset, price unchanged, foreign currency strengthened → pure FX gain", () => {
    // Bought at 1 EUR = 1.10 USD; now 1 EUR = 1.05 USD (USD stronger)
    const pos = computePosition([buy(10, 100, { purchaseFxRate: 1.1 })]);
    const v = valuePosition(pos, 100, 1.05);
    expect(v.localGainEurCents).toBe(0);
    expect(v.fxGainEurCents).toBeGreaterThan(0);
    expect(v.fxGainEurCents).toBe(v.unrealizedGainEurCents);
    // 1000 USD: cost 1000/1.1 = 909.09 EUR, now worth 1000/1.05 = 952.38 EUR
    expect(v.unrealizedGainEurCents).toBe(
      Math.round((1000 / 1.05) * 100) - Math.round((1000 / 1.1) * 100)
    );
  });

  it("combined price + FX move: decomposition identity holds exactly in cents", () => {
    const pos = computePosition([
      buy(7, 333.33, { purchaseFxRate: 1.0842, feeAmount: 1.5 }),
      buy(3, 341.07, { purchaseFxRate: 1.1219 }),
      sell(2, 350.0),
    ]);
    const v = valuePosition(pos, 362.41, 1.0931);
    expect(v.localGainEurCents + v.fxGainEurCents).toBe(v.unrealizedGainEurCents);
    expect(v.unrealizedGainEurCents).toBe(v.valueEurCents - v.costEurCents);
  });

  it("closed position values to zero without NaN", () => {
    const pos = computePosition([buy(10, 100), sell(10, 150)]);
    const v = valuePosition(pos, 200, 1);
    expect(v.valueEurCents).toBe(0);
    expect(v.costEurCents).toBe(0);
    expect(v.unrealizedGainEurCents).toBe(0);
    expect(v.returnPct).toBeNull();
  });
});
