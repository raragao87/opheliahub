import { PrismaClient } from "@prisma/client";
import { seedDefaultCategories } from "../src/lib/seed-categories";

const prisma = new PrismaClient();

async function main() {
  const household = await prisma.household.findFirst();
  if (household === null) {
    console.log("No household found");
    return;
  }

  console.log("Household:", household.name);

  // Check if personal categories already exist
  const personalCount = await prisma.category.count({
    where: { householdId: household.id, visibility: "PERSONAL" },
  });

  if (personalCount > 0) {
    console.log(`Already has ${personalCount} personal categories. Running seed to add any missing...`);
  } else {
    console.log("No personal categories found. Seeding defaults...");
  }

  // seedDefaultCategories now seeds both SHARED and PERSONAL,
  // and uses findFirst/create to avoid duplicates
  await seedDefaultCategories(prisma, household.id);

  const newCount = await prisma.category.count({
    where: { householdId: household.id, visibility: "PERSONAL" },
  });
  console.log(`Done. Now ${newCount} personal categories.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
