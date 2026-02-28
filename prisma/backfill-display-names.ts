import { PrismaClient } from "@prisma/client";
import { extractDisplayName } from "../src/lib/recurring";

const prisma = new PrismaClient();

async function main() {
  const batchSize = 500;
  let cursor: string | undefined;
  let updated = 0;

  while (true) {
    const transactions = await prisma.transaction.findMany({
      where: { displayName: null },
      select: { id: true, description: true },
      take: batchSize,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { id: "asc" },
    });

    if (transactions.length === 0) break;

    await prisma.$transaction(
      transactions.map((tx) =>
        prisma.transaction.update({
          where: { id: tx.id },
          data: { displayName: extractDisplayName(tx.description) },
        })
      )
    );

    updated += transactions.length;
    cursor = transactions[transactions.length - 1].id;
    console.log(`Backfilled ${updated} transactions...`);
  }

  console.log(`Done. Total: ${updated}`);
}

main().finally(() => prisma.$disconnect());
