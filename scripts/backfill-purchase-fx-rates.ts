/**
 * Backfill purchaseFxRate on existing InvestmentDetail records.
 *
 * For each InvestmentDetail where purchaseFxRate IS NULL:
 * - If the asset's currency is EUR → set purchaseFxRate = 1.0
 * - Otherwise, try the account's weighted average pool rate first
 * - Fall back to the closest CurrencyRate (market rate)
 *
 * Usage:  npx tsx scripts/backfill-purchase-fx-rates.ts
 */

import { PrismaClient } from "@prisma/client";
import { computeAccountFxPoolRate } from "../src/lib/finance/currency-pool";

const prisma = new PrismaClient();

async function main() {
  const details = await prisma.investmentDetail.findMany({
    where: { purchaseFxRate: null },
    include: {
      investmentAsset: { select: { currency: true } },
      transaction: { select: { date: true, accountId: true } },
    },
  });

  console.log(`Found ${details.length} InvestmentDetail records with null purchaseFxRate.\n`);

  let updated = 0;
  let skipped = 0;
  let usedPool = 0;
  let usedMarket = 0;

  for (const detail of details) {
    const currency = detail.investmentAsset.currency;

    if (currency === "EUR") {
      await prisma.investmentDetail.update({
        where: { id: detail.id },
        data: { purchaseFxRate: 1.0 },
      });
      updated++;
      continue;
    }

    const poolRate = await computeAccountFxPoolRate(
      prisma,
      detail.transaction.accountId,
      currency,
      detail.transaction.date,
    );

    if (poolRate) {
      await prisma.investmentDetail.update({
        where: { id: detail.id },
        data: { purchaseFxRate: poolRate },
      });
      updated++;
      usedPool++;
      continue;
    }

    const rate = await prisma.currencyRate.findFirst({
      where: {
        currency,
        baseCurrency: "EUR",
        date: { lte: detail.transaction.date },
      },
      orderBy: { date: "desc" },
      select: { rate: true },
    });

    if (rate) {
      const fxRate = rate.rate / 1_000_000;
      await prisma.investmentDetail.update({
        where: { id: detail.id },
        data: { purchaseFxRate: fxRate },
      });
      updated++;
      usedMarket++;
    } else {
      console.log(`  SKIP ${detail.id} — no rate found for ${currency}`);
      skipped++;
    }
  }

  console.log(`\nDone. Updated: ${updated} (pool: ${usedPool}, market: ${usedMarket}), Skipped: ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
