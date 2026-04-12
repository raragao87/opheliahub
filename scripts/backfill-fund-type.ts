/**
 * Backfill: Reclassify EXPENSE transactions with fundId to FUND type.
 * Run with: npx tsx scripts/backfill-fund-type.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$executeRawUnsafe(`
    UPDATE transactions
    SET type = 'FUND'
    WHERE "fundId" IS NOT NULL
      AND type != 'FUND'
      AND type != 'TRANSFER'
  `);
  console.log(`Reclassified ${result} fund transactions from EXPENSE to FUND`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
