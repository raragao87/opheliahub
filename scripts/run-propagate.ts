import { PrismaClient } from "@prisma/client";
import { extractDisplayName } from "../src/lib/recurring";

async function main() {
  const prisma = new PrismaClient();
  try {
    const rules = await prisma.recurringRule.findMany({
      where: { categoryId: { not: null } },
    });

    console.log(`Propagating categories for ${rules.length} rules with categories...\n`);

    for (const rule of rules) {
      if (!rule.categoryId) continue;

      const counterparty = (
        rule.description ? extractDisplayName(rule.description) : rule.name
      ).toLowerCase();

      // Fetch ALL transactions for account+type — do NOT use Prisma's NOT
      // filter because `NOT: { categoryId: X }` skips NULL rows in SQL.
      const transactions = await prisma.transaction.findMany({
        where: {
          accountId: rule.accountId,
          type: rule.type,
        },
        select: { id: true, description: true, categoryId: true },
      });

      const matchingIds = transactions
        .filter((tx) => {
          if (tx.categoryId === rule.categoryId) return false; // already correct
          const txName = extractDisplayName(tx.description).toLowerCase();
          return txName === counterparty;
        })
        .map((tx) => tx.id);

      if (matchingIds.length > 0) {
        const result = await prisma.transaction.updateMany({
          where: { id: { in: matchingIds } },
          data: { categoryId: rule.categoryId },
        });
        console.log(`  "${rule.name}" → updated ${result.count} transactions`);
      } else {
        console.log(`  "${rule.name}" → already up to date`);
      }
    }

    console.log("\nDone!");
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(console.error);
