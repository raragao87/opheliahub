/**
 * Portfolio holdings math — pure functions, no Prisma.
 *
 * Conventions:
 * - All FX rates are asset-currency units per EUR (1 EUR = X foreign),
 *   matching purchaseFxRate / CurrencyRate (see currency-pool.ts).
 * - Quantities/prices are plain numbers; the router converts Prisma
 *   Decimal via Number() at the boundary (safe at personal-portfolio
 *   magnitudes — Decimal(18,8) fits in a double).
 * - EUR outputs are integer cents, rounded only at the final step.
 */

export interface TradeRow {
  date: Date;
  /** Units bought (positive) or sold (negative) */
  quantity: number;
  /** Price per unit in the asset's native currency */
  unitPrice: number;
  /** Asset-currency per EUR at purchase; null → assume 1 (EUR asset / unknown) */
  purchaseFxRate: number | null;
  /** Fee in the asset's native currency; capitalized into cost basis */
  feeAmount: number | null;
}

export interface PositionState {
  /** Net units held */
  quantity: number;
  /** Weighted average cost per unit, asset currency (incl. fees) */
  avgCostLocal: number;
  /** Remaining cost basis, asset currency */
  costBasisLocal: number;
  /** Remaining cost basis, EUR (float — round at output) */
  costBasisEur: number;
  /** Data-quality flags, e.g. "OVERSOLD" */
  warnings: string[];
}

export interface PositionValuation {
  valueEurCents: number;
  costEurCents: number;
  unrealizedGainEurCents: number;
  /** Gain from price movement, converted at the current FX rate */
  localGainEurCents: number;
  /** Gain from currency movement on the cost basis */
  fxGainEurCents: number;
  /** unrealizedGain / cost; null when cost is 0 */
  returnPct: number | null;
}

/** CurrencyRate.rate is stored as a micro-rate Int: 1.0842 → 1084200 */
export function microRateToFloat(rate: number): number {
  return rate / 1_000_000;
}

/**
 * Fold trades (ordered by date) into a position using weighted average
 * cost with dual pools: the local-currency cost basis and the EUR cost
 * basis (each buy converted at its own purchase FX rate). Sells reduce
 * both pools proportionally at average cost, so the EUR pool keeps the
 * blended purchase rate exact across buys at different rates.
 */
export function computePosition(trades: TradeRow[]): PositionState {
  let quantity = 0;
  let costBasisLocal = 0;
  let costBasisEur = 0;
  const warnings: string[] = [];

  for (const trade of trades) {
    if (trade.quantity > 0) {
      const costLocal = trade.quantity * trade.unitPrice + (trade.feeAmount ?? 0);
      const rate = trade.purchaseFxRate ?? 1;
      costBasisLocal += costLocal;
      costBasisEur += costLocal / rate;
      quantity += trade.quantity;
    } else if (trade.quantity < 0) {
      const sellQty = Math.min(-trade.quantity, quantity);
      if (-trade.quantity > quantity && !warnings.includes("OVERSOLD")) {
        warnings.push("OVERSOLD");
      }
      if (quantity > 0) {
        const fraction = sellQty / quantity;
        costBasisLocal *= 1 - fraction;
        costBasisEur *= 1 - fraction;
        quantity -= sellQty;
      }
      // Clamp tiny float residue so a full sell reads as exactly closed
      if (quantity < 1e-9) {
        quantity = 0;
        costBasisLocal = 0;
        costBasisEur = 0;
      }
    }
  }

  return {
    quantity,
    avgCostLocal: quantity > 0 ? costBasisLocal / quantity : 0,
    costBasisLocal,
    costBasisEur,
    warnings,
  };
}

/**
 * Value a position at the current price and FX rate, decomposing the
 * unrealized gain into price movement (local) and currency movement (FX).
 *
 * Identity: localGain + fxGain = unrealizedGain — guaranteed in cents by
 * computing fxGain as the residual after rounding.
 */
export function valuePosition(
  pos: PositionState,
  currentPrice: number,
  currentFxRate: number,
): PositionValuation {
  const valueEur = (pos.quantity * currentPrice) / currentFxRate;
  const costEur = pos.costBasisEur;
  const localGainEur = (pos.quantity * currentPrice - pos.costBasisLocal) / currentFxRate;

  const valueEurCents = Math.round(valueEur * 100);
  const costEurCents = Math.round(costEur * 100);
  const unrealizedGainEurCents = valueEurCents - costEurCents;
  const localGainEurCents = Math.round(localGainEur * 100);
  const fxGainEurCents = unrealizedGainEurCents - localGainEurCents;

  return {
    valueEurCents,
    costEurCents,
    unrealizedGainEurCents,
    localGainEurCents,
    fxGainEurCents,
    returnPct: costEurCents !== 0 ? unrealizedGainEurCents / costEurCents : null,
  };
}
