/**
 * One-time script: backfill displayName on all transactions using the
 * improved extractDisplayName() logic.
 *
 * Usage:  npx tsx scripts/backfill-display-names.ts [--force]
 *
 * Without --force: only updates transactions where displayName is null
 * or still contains raw SEPA codes (/TRTP/, /NAME/, etc.)
 *
 * With --force: re-extracts displayName for ALL transactions.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { extractDisplayName } from "../src/lib/recurring";

const prisma = new PrismaClient();
const force = process.argv.includes("--force");

async function main() {
  console.log(`Backfilling display names (force=${force})...\n`);

  const where: Prisma.TransactionWhereInput = force
    ? {}
    : {
        OR: [
          { displayName: null },
          { displayName: { startsWith: "/TRTP/" } },
          { displayName: { contains: "/NAME/" } },
          { displayName: { contains: "/REMI/" } },
          { displayName: { contains: "/CSID/" } },
          { displayName: { contains: "/IBAN/" } },
        ],
      };

  const transactions = await prisma.transaction.findMany({
    where,
    select: { id: true, description: true, displayName: true },
  });

  console.log(`Found ${transactions.length} transaction(s) to process.\n`);

  let updated = 0;
  let skipped = 0;

  for (const txn of transactions) {
    const newDisplayName = extractDisplayName(txn.description);

    if (newDisplayName === txn.displayName) {
      skipped++;
      continue;
    }

    await prisma.transaction.update({
      where: { id: txn.id },
      data: { displayName: newDisplayName },
    });

    updated++;

    // Log a sample of changes
    if (updated <= 20) {
      const before = (txn.displayName ?? "(null)").slice(0, 50);
      const after = newDisplayName.slice(0, 50);
      console.log(`  "${before}" → "${after}"`);
    }
  }

  if (updated > 20) {
    console.log(`  ... and ${updated - 20} more`);
  }

  console.log(`\nDone. Updated: ${updated}, Skipped (unchanged): ${skipped}, Total processed: ${transactions.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
