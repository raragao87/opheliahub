/**
 * Seed INVESTMENT categories for all existing households.
 * Run with: npx tsx scripts/seed-investment-categories.ts
 */
import { PrismaClient } from "@prisma/client";
import { seedDefaultCategories } from "../src/lib/seed-categories";

const prisma = new PrismaClient();

async function main() {
  const households = await prisma.household.findMany({ select: { id: true, name: true } });
  console.log(`Found ${households.length} households`);

  for (const household of households) {
    // seedDefaultCategories is idempotent — it skips existing categories
    await seedDefaultCategories(prisma, household.id);
    console.log(`Seeded investment categories for household: ${household.name}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
