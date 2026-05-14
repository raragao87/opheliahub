// @ts-nocheck — one-shot migration script; Fund model has been removed from schema
/**
 * Migrate Fund records → FUND-type Categories, and set up TRANSFER categories.
 *
 * Idempotent: safe to run multiple times. Skips records that already exist.
 *
 * Run with: npx tsx scripts/migrate-funds-to-categories.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("═══ Fund → Category Migration ═══\n");

  // ── 1a. Migrate "Transfers" groups to type TRANSFER ──────────────────

  console.log("── 1a. Migrate Transfers groups to TRANSFER type ──\n");

  // Find all households
  const households = await prisma.household.findMany({ select: { id: true, name: true } });

  for (const hh of households) {
    for (const vis of ["SHARED", "PERSONAL"] as const) {
      // Find or create the "Transfers" parent
      let transfersParent = await prisma.category.findFirst({
        where: { householdId: hh.id, name: "Transfers", parentId: null, visibility: vis },
      });

      if (!transfersParent) {
        transfersParent = await prisma.category.create({
          data: {
            name: "Transfers",
            icon: "🔄",
            color: "#6b7280",
            type: "TRANSFER",
            householdId: hh.id,
            visibility: vis,
            sortOrder: 40,
          },
        });
        console.log(`  Created "Transfers" parent (${vis}) for ${hh.name}`);
      } else if (transfersParent.type !== "TRANSFER") {
        await prisma.category.update({
          where: { id: transfersParent.id },
          data: { type: "TRANSFER" },
        });
        console.log(`  Updated "Transfers" parent to TRANSFER type (${vis}) for ${hh.name}`);
      } else {
        console.log(`  "Transfers" parent already TRANSFER (${vis}) for ${hh.name}`);
      }

      // Handle children: rename existing "Transfer" → "Unmatched", create "Matched"
      const existingTransfer = await prisma.category.findFirst({
        where: { parentId: transfersParent.id, name: "Transfer", householdId: hh.id, visibility: vis },
      });

      const existingMatched = await prisma.category.findFirst({
        where: { parentId: transfersParent.id, name: "Matched", householdId: hh.id, visibility: vis },
      });

      const existingUnmatched = await prisma.category.findFirst({
        where: { parentId: transfersParent.id, name: "Unmatched", householdId: hh.id, visibility: vis },
      });

      if (existingTransfer && !existingUnmatched) {
        await prisma.category.update({
          where: { id: existingTransfer.id },
          data: { name: "Unmatched", icon: "🔄", type: "TRANSFER", sortOrder: 1 },
        });
        console.log(`  Renamed "Transfer" → "Unmatched" (${vis})`);
      } else if (existingTransfer && existingUnmatched) {
        console.log(`  Both "Transfer" and "Unmatched" exist (${vis}) — skipping rename`);
      }

      if (!existingUnmatched && !existingTransfer) {
        await prisma.category.create({
          data: {
            name: "Unmatched",
            icon: "🔄",
            color: "#6b7280",
            type: "TRANSFER",
            parentId: transfersParent.id,
            householdId: hh.id,
            visibility: vis,
            sortOrder: 1,
          },
        });
        console.log(`  Created "Unmatched" (${vis})`);
      } else if (existingUnmatched) {
        if (existingUnmatched.type !== "TRANSFER") {
          await prisma.category.update({ where: { id: existingUnmatched.id }, data: { type: "TRANSFER" } });
        }
        console.log(`  "Unmatched" already exists (${vis})`);
      }

      if (!existingMatched) {
        await prisma.category.create({
          data: {
            name: "Matched",
            icon: "🔗",
            color: "#6b7280",
            type: "TRANSFER",
            parentId: transfersParent.id,
            householdId: hh.id,
            visibility: vis,
            sortOrder: 0,
          },
        });
        console.log(`  Created "Matched" (${vis})`);
      } else {
        if (existingMatched.type !== "TRANSFER") {
          await prisma.category.update({ where: { id: existingMatched.id }, data: { type: "TRANSFER" } });
        }
        console.log(`  "Matched" already exists (${vis})`);
      }
    }
  }

  // ── 1b. Create FUND-type categories from Fund records ────────────────

  console.log("\n── 1b. Create FUND categories from Fund records ──\n");

  const funds = await prisma.fund.findMany({ orderBy: { sortOrder: "asc" } });
  const fundToCategoryMap = new Map<string, string>();

  for (const fund of funds) {
    const existing = await prisma.category.findFirst({
      where: {
        householdId: fund.householdId,
        name: fund.name,
        visibility: fund.visibility,
        type: "FUND",
      },
    });

    if (existing) {
      fundToCategoryMap.set(fund.id, existing.id);
      console.log(`  [skip] "${fund.name}" (${fund.visibility}) — already exists as ${existing.id}`);
      continue;
    }

    const newCat = await prisma.category.create({
      data: {
        name: fund.name,
        icon: fund.icon,
        color: fund.color,
        type: "FUND",
        householdId: fund.householdId,
        visibility: fund.visibility,
        sortOrder: fund.sortOrder,
        isArchived: fund.isArchived,
        linkedAccountId: fund.linkedAccountId,
        parentId: null,
      },
    });

    fundToCategoryMap.set(fund.id, newCat.id);
    console.log(`  [create] "${fund.name}" (${fund.visibility}) → ${newCat.id}`);
  }

  if (fundToCategoryMap.size === 0) {
    console.log("  No funds to migrate.");
  }

  // Build VALUES clause for raw SQL updates
  const mappingValues = Array.from(fundToCategoryMap.entries())
    .map(([oldId, newId]) => `('${oldId}', '${newId}')`)
    .join(", ");

  // ── 1c. Migrate Transaction.fundId → categoryId ─────────────────────

  console.log("\n── 1c. Migrate Transaction.fundId → categoryId ──\n");

  if (fundToCategoryMap.size > 0) {
    const txnResult = await prisma.$executeRawUnsafe(`
      UPDATE transactions
      SET "categoryId" = mapping.new_category_id,
          "effectiveCategoryId" = mapping.new_category_id
      FROM (VALUES ${mappingValues}) AS mapping(old_fund_id, new_category_id)
      WHERE transactions."fundId" = mapping.old_fund_id
    `);
    console.log(`  Updated ${txnResult} transactions`);
  } else {
    console.log("  No fund mappings — skipping");
  }

  // ── 1d. Assign transfer categories to TRANSFER transactions ─────────

  console.log("\n── 1d. Assign transfer categories ──\n");

  for (const hh of households) {
    for (const vis of ["SHARED", "PERSONAL"] as const) {
      const matched = await prisma.category.findFirst({
        where: { householdId: hh.id, name: "Matched", type: "TRANSFER", visibility: vis, parentId: { not: null } },
      });
      const unmatched = await prisma.category.findFirst({
        where: { householdId: hh.id, name: "Unmatched", type: "TRANSFER", visibility: vis, parentId: { not: null } },
      });

      if (!matched || !unmatched) {
        console.log(`  [skip] ${hh.name} (${vis}) — missing Matched/Unmatched categories`);
        continue;
      }

      const ownershipValue = vis === "SHARED" ? "SHARED" : "PERSONAL";

      // Matched: linked in either direction
      const matchedResult = await prisma.$executeRawUnsafe(`
        UPDATE transactions t
        SET "categoryId" = '${matched.id}',
            "effectiveCategoryId" = '${matched.id}'
        FROM financial_accounts a
        WHERE t."accountId" = a.id
          AND a.ownership = '${ownershipValue}'
          AND t.type = 'TRANSFER'
          AND t."deletedAt" IS NULL
          AND (
            t."linkedTransactionId" IS NOT NULL
            OR EXISTS (SELECT 1 FROM transactions t2 WHERE t2."linkedTransactionId" = t.id)
          )
      `);

      // Unmatched: not linked in either direction
      const unmatchedResult = await prisma.$executeRawUnsafe(`
        UPDATE transactions t
        SET "categoryId" = '${unmatched.id}',
            "effectiveCategoryId" = '${unmatched.id}'
        FROM financial_accounts a
        WHERE t."accountId" = a.id
          AND a.ownership = '${ownershipValue}'
          AND t.type = 'TRANSFER'
          AND t."deletedAt" IS NULL
          AND t."linkedTransactionId" IS NULL
          AND NOT EXISTS (SELECT 1 FROM transactions t2 WHERE t2."linkedTransactionId" = t.id)
      `);

      console.log(`  ${hh.name} (${vis}): ${matchedResult} matched, ${unmatchedResult} unmatched`);
    }
  }

  // ── 1e. Migrate FundEntry.fundId → categoryId ──────────────────────

  console.log("\n── 1e. Migrate FundEntry.fundId → categoryId ──\n");

  if (fundToCategoryMap.size > 0) {
    const entryResult = await prisma.$executeRawUnsafe(`
      UPDATE fund_entries
      SET "categoryId" = mapping.new_category_id
      FROM (VALUES ${mappingValues}) AS mapping(old_fund_id, new_category_id)
      WHERE fund_entries."fundId" = mapping.old_fund_id
    `);
    console.log(`  Updated ${entryResult} fund entries`);
  } else {
    console.log("  No fund mappings — skipping");
  }

  // ── 1f. Migrate FundTrackerAllocation.fundId → categoryId ──────────

  console.log("\n── 1f. Migrate FundTrackerAllocation.fundId → categoryId ──\n");

  if (fundToCategoryMap.size > 0) {
    const allocResult = await prisma.$executeRawUnsafe(`
      UPDATE fund_tracker_allocations
      SET "categoryId" = mapping.new_category_id
      FROM (VALUES ${mappingValues}) AS mapping(old_fund_id, new_category_id)
      WHERE fund_tracker_allocations."fundId" = mapping.old_fund_id
    `);
    console.log(`  Updated ${allocResult} fund tracker allocations`);
  } else {
    console.log("  No fund mappings — skipping");
  }

  // ── 1g. Migrate BudgetLineItem.fundId → categoryId ────────────────

  console.log("\n── 1g. Migrate BudgetLineItem.fundId → categoryId ──\n");

  if (fundToCategoryMap.size > 0) {
    const bliResult = await prisma.$executeRawUnsafe(`
      UPDATE budget_line_items
      SET "categoryId" = mapping.new_category_id,
          "fundId" = NULL
      FROM (VALUES ${mappingValues}) AS mapping(old_fund_id, new_category_id)
      WHERE budget_line_items."fundId" = mapping.old_fund_id
        AND budget_line_items."categoryId" IS NULL
    `);
    console.log(`  Updated ${bliResult} budget line items`);
  } else {
    console.log("  No fund mappings — skipping");
  }

  // ── 1h. Verification ──────────────────────────────────────────────

  console.log("\n── 1h. Verification ──\n");

  const [orphanTxns] = await prisma.$queryRawUnsafe<[{ cnt: number }]>(
    `SELECT count(*)::int as cnt FROM transactions WHERE "categoryId" IS NULL AND "deletedAt" IS NULL AND "isInitialBalance" = false`
  );
  const [orphanEntries] = await prisma.$queryRawUnsafe<[{ cnt: number }]>(
    `SELECT count(*)::int as cnt FROM fund_entries WHERE "categoryId" IS NULL`
  );
  const [orphanAllocs] = await prisma.$queryRawUnsafe<[{ cnt: number }]>(
    `SELECT count(*)::int as cnt FROM fund_tracker_allocations WHERE "categoryId" IS NULL`
  );
  const [orphanBli] = await prisma.$queryRawUnsafe<[{ cnt: number }]>(
    `SELECT count(*)::int as cnt FROM budget_line_items WHERE "fundId" IS NOT NULL AND "categoryId" IS NULL`
  );

  console.log(`  Transactions without categoryId (excl. initial balance): ${orphanTxns.cnt}${orphanTxns.cnt > 0 ? " ⚠ WARNING" : " ✓"}`);
  console.log(`  Fund entries without categoryId: ${orphanEntries.cnt}${orphanEntries.cnt > 0 ? " ⚠ WARNING" : " ✓"}`);
  console.log(`  Fund tracker allocations without categoryId: ${orphanAllocs.cnt}${orphanAllocs.cnt > 0 ? " ⚠ WARNING" : " ✓"}`);
  console.log(`  Budget line items with fundId but no categoryId: ${orphanBli.cnt}${orphanBli.cnt > 0 ? " ⚠ WARNING" : " ✓"}`);

  // Summary
  const [catCounts] = await prisma.$queryRawUnsafe<[{ fund: number; transfer: number }]>(`
    SELECT
      (SELECT count(*)::int FROM categories WHERE type = 'FUND') as fund,
      (SELECT count(*)::int FROM categories WHERE type = 'TRANSFER') as transfer
  `);
  console.log(`\n  FUND categories created: ${catCounts.fund}`);
  console.log(`  TRANSFER categories created: ${catCounts.transfer}`);

  console.log("\n═══ Migration complete ═══");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
