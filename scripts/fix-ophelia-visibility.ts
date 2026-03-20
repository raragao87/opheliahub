import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find transactions where ophelia suggestion has wrong visibility
  const mismatched = await prisma.$queryRaw<
    Array<{ id: string; tx_vis: string; cat_vis: string; desc: string }>
  >`
    SELECT t.id, t.visibility as tx_vis, c.visibility as cat_vis,
           LEFT(t.description, 50) as desc
    FROM transactions t
    JOIN categories c ON t."opheliaCategoryId" = c.id
    WHERE t."opheliaCategoryId" IS NOT NULL
      AND t."categoryId" IS NULL
      AND t.visibility != c.visibility
  `;

  console.log(
    `Found ${mismatched.length} transactions with cross-visibility Ophelia suggestions:`
  );
  for (const m of mismatched) {
    console.log(`  ${m.desc} — tx: ${m.tx_vis}, cat: ${m.cat_vis}`);
  }

  if (mismatched.length === 0) {
    console.log("Nothing to fix!");
    return;
  }

  // Clear the invalid suggestions and reset processing flag so Ophelia can retry
  const result = await prisma.transaction.updateMany({
    where: { id: { in: mismatched.map((m) => m.id) } },
    data: {
      opheliaCategoryId: null,
      opheliaConfidence: null,
      opheliaProcessedAt: null, // allow Ophelia to reprocess with correct visibility
    },
  });

  console.log(
    `Cleared ${result.count} cross-visibility suggestions. Ophelia will reprocess them.`
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
