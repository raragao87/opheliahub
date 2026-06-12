import type { PrismaClient } from "@prisma/client";

/**
 * Compute the weighted average FX rate for a foreign-currency account.
 *
 * Looks at all deposits (positive amounts) into the account that have a
 * fxRate set, and computes the weighted average rate up to a given date.
 *
 * @returns The weighted average rate (1 EUR = X foreign currency),
 *          or null if no deposits with fxRate exist.
 */
export async function computeAccountFxPoolRate(
  prisma: PrismaClient,
  accountId: string,
  _targetCurrency: string,
  asOfDate: Date,
): Promise<number | null> {
  const deposits = await prisma.transaction.findMany({
    where: {
      accountId,
      fxRate: { not: null },
      amount: { gt: 0 },
      date: { lte: asOfDate },
      deletedAt: null,
    },
    select: {
      amount: true,
      fxRate: true,
    },
    orderBy: { date: "asc" },
  });

  if (deposits.length === 0) return null;

  let totalEurCents = 0;
  let weightedRateSum = 0;

  for (const d of deposits) {
    const eurCents = d.amount;
    const rate = Number(d.fxRate!);
    totalEurCents += eurCents;
    weightedRateSum += eurCents * rate;
  }

  if (totalEurCents === 0) return null;

  return weightedRateSum / totalEurCents;
}

/**
 * Compute the hidden FX fee on a deposit — the difference between the
 * market rate and the actual rate the user got.
 *
 * @param depositEurCents  - EUR amount deposited (cents)
 * @param actualFxRate     - rate the user actually got (1 EUR = X foreign)
 * @param marketFxRate     - market rate at the time (from CurrencyRate table)
 * @returns fee in EUR cents (positive = user paid more than market)
 */
export function computeFxConversionFee(
  depositEurCents: number,
  actualFxRate: number,
  marketFxRate: number,
): number {
  const eurAmount = depositEurCents / 100;
  const feeEur = eurAmount * (marketFxRate - actualFxRate) / marketFxRate;
  return Math.round(feeEur * 100);
}
