/**
 * Data migration: Convert Asset and Debt records to FinancialAccount records.
 *
 * Assets → FinancialAccount (PROPERTY / VEHICLE / OTHER_ASSET)
 * Debts  → FinancialAccount (MORTGAGE / OTHER_DEBT)
 *
 * Each migrated record also gets an initial "Initial Balance" transaction.
 *
 * Usage: npx tsx scripts/migrate-assets-debts.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function mapAssetCategory(category: string): "PROPERTY" | "VEHICLE" | "OTHER_ASSET" {
  switch (category) {
    case "real_estate":
      return "PROPERTY";
    case "vehicle":
      return "VEHICLE";
    default:
      return "OTHER_ASSET";
  }
}

function mapDebtType(name: string): "MORTGAGE" | "OTHER_DEBT" {
  if (name.toLowerCase().includes("mortgage")) {
    return "MORTGAGE";
  }
  return "OTHER_DEBT";
}

async function main() {
  console.log("Starting Asset/Debt → FinancialAccount migration...\n");

  // Get the household for each user (needed for shared accounts)
  const memberships = await prisma.householdMember.findMany({
    where: { inviteStatus: "ACCEPTED" },
    select: { userId: true, householdId: true },
  });
  const userHouseholdMap = new Map<string, string>();
  for (const m of memberships) {
    userHouseholdMap.set(m.userId, m.householdId);
  }

  // ── Migrate Assets ──────────────────────────────────────────────
  const assets = await prisma.asset.findMany();
  console.log(`Found ${assets.length} assets to migrate.`);

  for (const asset of assets) {
    // Check if already migrated (account with same ID)
    const existing = await prisma.financialAccount.findUnique({
      where: { id: asset.id },
    });
    if (existing) {
      console.log(`  ⏭ Asset "${asset.name}" already migrated, skipping.`);
      continue;
    }

    const accountType = mapAssetCategory(asset.category);
    const ownership = asset.visibility as "SHARED" | "PERSONAL";
    const householdId =
      ownership === "SHARED" ? userHouseholdMap.get(asset.userId) ?? null : null;

    // Create the FinancialAccount
    await prisma.financialAccount.create({
      data: {
        id: asset.id, // reuse the Asset ID
        name: asset.name,
        type: accountType,
        ownership,
        currency: asset.currency,
        balance: asset.value, // positive for assets
        isActive: true,
        ownerId: asset.userId,
        householdId,
        metadata: {
          assetCategory: asset.category,
          migratedFrom: "asset",
        },
        notes: asset.notes,
      },
    });

    // Create initial transaction
    if (asset.value !== 0) {
      await prisma.transaction.create({
        data: {
          id: `txn-${asset.id}`,
          amount: asset.value,
          currency: asset.currency,
          type: "INCOME",
          description: "Initial Balance",
          date: asset.lastUpdated,
          accountId: asset.id,
          userId: asset.userId,
        },
      });
    }

    console.log(`  ✅ Asset "${asset.name}" → ${accountType} (${asset.value} cents)`);
  }

  // ── Migrate Debts ───────────────────────────────────────────────
  const debts = await prisma.debt.findMany();
  console.log(`\nFound ${debts.length} debts to migrate.`);

  for (const debt of debts) {
    // Check if already migrated
    const existing = await prisma.financialAccount.findUnique({
      where: { id: debt.id },
    });
    if (existing) {
      console.log(`  ⏭ Debt "${debt.name}" already migrated, skipping.`);
      continue;
    }

    const accountType = mapDebtType(debt.name);
    const ownership = debt.visibility as "SHARED" | "PERSONAL";
    const householdId =
      ownership === "SHARED" ? userHouseholdMap.get(debt.userId) ?? null : null;

    // Store balance as negative (liability convention)
    const negativeBalance = -debt.balance;

    // Create the FinancialAccount
    await prisma.financialAccount.create({
      data: {
        id: debt.id, // reuse the Debt ID
        name: debt.name,
        type: accountType,
        ownership,
        currency: debt.currency,
        balance: negativeBalance,
        isActive: true,
        ownerId: debt.userId,
        householdId,
        metadata: {
          interestRate: debt.interestRate,
          monthlyPayment: debt.monthlyPayment,
          migratedFrom: "debt",
        },
        notes: debt.notes,
      },
    });

    // Create initial transaction (negative = expense)
    if (debt.balance !== 0) {
      await prisma.transaction.create({
        data: {
          id: `txn-${debt.id}`,
          amount: negativeBalance,
          currency: debt.currency,
          type: "EXPENSE",
          description: "Initial Balance",
          date: debt.lastUpdated,
          accountId: debt.id,
          userId: debt.userId,
        },
      });
    }

    console.log(`  ✅ Debt "${debt.name}" → ${accountType} (${negativeBalance} cents)`);
  }

  console.log("\n✨ Migration complete!");
  console.log(`  Assets migrated: ${assets.length}`);
  console.log(`  Debts migrated: ${debts.length}`);
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
