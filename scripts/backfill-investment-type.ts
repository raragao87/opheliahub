/**
 * Reclassify INCOME/EXPENSE transactions on investment accounts to INVESTMENT.
 * Run with: npx tsx scripts/backfill-investment-type.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$executeRawUnsafe(`
    UPDATE transactions t
    SET type = 'INVESTMENT'
    FROM financial_accounts a
    WHERE t."accountId" = a.id
      AND a.type IN ('SAVINGS', 'INVESTMENT', 'CRYPTO')
      AND t.type IN ('INCOME', 'EXPENSE')
  `);
  console.log(`Reclassified ${result} transactions to INVESTMENT`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
