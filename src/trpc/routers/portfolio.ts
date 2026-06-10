import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";
import { visibleTransactionsWhere, transactionOwnershipFilter } from "@/lib/privacy";
import {
  computePosition,
  valuePosition,
  microRateToFloat,
  type TradeRow,
} from "@/lib/finance/portfolio";

const PRICE_STALE_DAYS = 7;

const scopeInput = z
  .object({ budgetScope: z.enum(["SHARED", "PERSONAL"]).optional() })
  .optional();

type Ctx = {
  prisma: typeof import("@/lib/prisma").prisma;
  userId: string;
  householdId: string;
};

export interface Holding {
  asset: {
    id: string;
    ticker: string | null;
    name: string;
    type: string;
    currency: string;
  };
  quantity: number;
  avgCostLocal: number;
  latestPrice: number;
  priceDate: Date;
  priceSource: "asset_price" | "last_trade";
  priceIsStale: boolean;
  fxRate: number;
  fxRateMissing: boolean;
  valueEurCents: number;
  costEurCents: number;
  unrealizedGainEurCents: number;
  localGainEurCents: number;
  fxGainEurCents: number;
  returnPct: number | null;
  accountIds: string[];
  warnings: string[];
}

/**
 * Load all open holdings visible to the user, valued in EUR.
 * Privacy is enforced at the query level via the transaction filter —
 * a partner's PERSONAL investment transactions never enter the aggregation.
 */
async function loadHoldings(
  ctx: Ctx,
  budgetScope?: "SHARED" | "PERSONAL",
): Promise<Holding[]> {
  const txWhere = budgetScope
    ? transactionOwnershipFilter(ctx.userId, ctx.householdId, budgetScope)
    : visibleTransactionsWhere(ctx.userId, ctx.householdId);

  const details = await ctx.prisma.investmentDetail.findMany({
    where: {
      investmentAsset: { householdId: ctx.householdId },
      transaction: { ...txWhere, type: "INVESTMENT" },
    },
    include: {
      investmentAsset: {
        select: { id: true, ticker: true, name: true, type: true, currency: true },
      },
      transaction: { select: { date: true, accountId: true } },
    },
    orderBy: { transaction: { date: "asc" } },
  });

  if (details.length === 0) return [];

  // Group trades by asset (Decimal → number at the boundary; see portfolio.ts)
  const byAsset = new Map<
    string,
    {
      asset: Holding["asset"];
      trades: TradeRow[];
      accountIds: Set<string>;
      lastTradePrice: number;
      lastTradeDate: Date;
    }
  >();
  for (const d of details) {
    let entry = byAsset.get(d.investmentAssetId);
    if (!entry) {
      entry = {
        asset: d.investmentAsset,
        trades: [],
        accountIds: new Set(),
        lastTradePrice: 0,
        lastTradeDate: d.transaction.date,
      };
      byAsset.set(d.investmentAssetId, entry);
    }
    entry.trades.push({
      date: d.transaction.date,
      quantity: Number(d.quantity),
      unitPrice: Number(d.unitPrice),
      purchaseFxRate: d.purchaseFxRate != null ? Number(d.purchaseFxRate) : null,
      feeAmount: d.feeAmount != null ? Number(d.feeAmount) : null,
    });
    entry.accountIds.add(d.transaction.accountId);
    // details are date-ascending, so the last row is the latest trade
    entry.lastTradePrice = Number(d.unitPrice);
    entry.lastTradeDate = d.transaction.date;
  }

  const assetIds = [...byAsset.keys()];

  // Latest stored price per asset
  const prices = await ctx.prisma.assetPrice.findMany({
    where: { investmentAssetId: { in: assetIds } },
    orderBy: { date: "desc" },
  });
  const latestPriceByAsset = new Map<string, { price: number; date: Date }>();
  for (const p of prices) {
    if (!latestPriceByAsset.has(p.investmentAssetId)) {
      latestPriceByAsset.set(p.investmentAssetId, {
        price: Number(p.price),
        date: p.date,
      });
    }
  }

  // Latest EUR rate per non-EUR currency
  const currencies = [
    ...new Set([...byAsset.values()].map((e) => e.asset.currency).filter((c) => c !== "EUR")),
  ];
  const rateByCurrency = new Map<string, number>();
  for (const currency of currencies) {
    const rate = await ctx.prisma.currencyRate.findFirst({
      where: { currency, baseCurrency: "EUR" },
      orderBy: { date: "desc" },
    });
    if (rate) rateByCurrency.set(currency, microRateToFloat(rate.rate));
  }

  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - PRICE_STALE_DAYS);

  const holdings: Holding[] = [];
  for (const [assetId, entry] of byAsset) {
    const pos = computePosition(entry.trades);
    if (pos.quantity <= 0) continue; // closed positions hidden in Phase 1

    const stored = latestPriceByAsset.get(assetId);
    const latestPrice = stored?.price ?? entry.lastTradePrice;
    const priceDate = stored?.date ?? entry.lastTradeDate;
    const priceSource: Holding["priceSource"] = stored ? "asset_price" : "last_trade";

    const isEur = entry.asset.currency === "EUR";
    const fxRate = isEur ? 1 : rateByCurrency.get(entry.asset.currency) ?? 1;
    const fxRateMissing = !isEur && !rateByCurrency.has(entry.asset.currency);

    const valuation = valuePosition(pos, latestPrice, fxRate);

    holdings.push({
      asset: entry.asset,
      quantity: pos.quantity,
      avgCostLocal: pos.avgCostLocal,
      latestPrice,
      priceDate,
      priceSource,
      priceIsStale: priceDate < staleCutoff,
      fxRate,
      fxRateMissing,
      ...valuation,
      accountIds: [...entry.accountIds],
      warnings: pos.warnings,
    });
  }

  holdings.sort((a, b) => b.valueEurCents - a.valueEurCents);
  return holdings;
}

export const portfolioRouter = router({
  getHoldings: householdProcedure.input(scopeInput).query(async ({ ctx, input }) => {
    return loadHoldings(ctx, input?.budgetScope);
  }),

  getSummary: householdProcedure.input(scopeInput).query(async ({ ctx, input }) => {
    const holdings = await loadHoldings(ctx, input?.budgetScope);
    const totalValueEurCents = holdings.reduce((s, h) => s + h.valueEurCents, 0);
    const totalCostEurCents = holdings.reduce((s, h) => s + h.costEurCents, 0);
    const unrealizedGainEurCents = totalValueEurCents - totalCostEurCents;
    const localGainEurCents = holdings.reduce((s, h) => s + h.localGainEurCents, 0);
    return {
      totalValueEurCents,
      totalCostEurCents,
      unrealizedGainEurCents,
      localGainEurCents,
      fxGainEurCents: unrealizedGainEurCents - localGainEurCents,
      returnPct: totalCostEurCents !== 0 ? unrealizedGainEurCents / totalCostEurCents : null,
      holdingsCount: holdings.length,
      missingRateCurrencies: [
        ...new Set(holdings.filter((h) => h.fxRateMissing).map((h) => h.asset.currency)),
      ],
      stalePriceCount: holdings.filter((h) => h.priceIsStale).length,
    };
  }),

  getAllocation: householdProcedure.input(scopeInput).query(async ({ ctx, input }) => {
    const holdings = await loadHoldings(ctx, input?.budgetScope);
    const totalValue = holdings.reduce((s, h) => s + h.valueEurCents, 0);
    const byType = new Map<string, number>();
    for (const h of holdings) {
      byType.set(h.asset.type, (byType.get(h.asset.type) ?? 0) + h.valueEurCents);
    }
    return [...byType.entries()]
      .map(([type, valueEurCents]) => ({
        type,
        valueEurCents,
        percentage: totalValue > 0 ? (valueEurCents / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.valueEurCents - a.valueEurCents);
  }),

  setAssetPrice: householdProcedure
    .input(
      z.object({
        assetId: z.string(),
        date: z.coerce.date(),
        price: z.number().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const asset = await ctx.prisma.investmentAsset.findFirst({
        where: { id: input.assetId, householdId: ctx.householdId },
      });
      if (!asset) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found." });
      }
      // @db.Date column — normalize to UTC midnight so upsert hits the unique key
      const day = new Date(Date.UTC(
        input.date.getFullYear(),
        input.date.getMonth(),
        input.date.getDate(),
      ));
      return ctx.prisma.assetPrice.upsert({
        where: {
          investmentAssetId_date: { investmentAssetId: input.assetId, date: day },
        },
        update: { price: input.price, source: "manual" },
        create: {
          investmentAssetId: input.assetId,
          date: day,
          price: input.price,
          source: "manual",
        },
      });
    }),
});
