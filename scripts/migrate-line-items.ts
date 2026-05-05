/**
 * Migrate FundLineItem and CategoryLineItem rows into the unified BudgetLineItem table.
 * Safe to run multiple times — skips if source tables don't exist.
 *
 * Usage: pnpm tsx scripts/migrate-line-items.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const tableExists = async (name: string) => {
    const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1) AS exists`,
      name
    );
    return rows[0]?.exists === true;
  };

  let migrated = 0;

  if (await tableExists("fund_line_items")) {
    const result = await prisma.$executeRawUnsafe(`
      INSERT INTO budget_line_items (id, "fundId", description, period, amount, "sortOrder")
      SELECT id, fund_id, description, period, amount, sort_order
      FROM fund_line_items
      ON CONFLICT (id) DO NOTHING
    `);
    console.log(`[fund_line_items] Migrated ${result} rows`);
    migrated += result;
  } else {
    console.log("[fund_line_items] Table does not exist, skipping");
  }

  if (await tableExists("category_line_items")) {
    const result = await prisma.$executeRawUnsafe(`
      INSERT INTO budget_line_items (id, "categoryId", description, period, amount, "sortOrder")
      SELECT id, category_id, description, period, amount, sort_order
      FROM category_line_items
      ON CONFLICT (id) DO NOTHING
    `);
    console.log(`[category_line_items] Migrated ${result} rows`);
    migrated += result;
  } else {
    console.log("[category_line_items] Table does not exist, skipping");
  }

  console.log(`\nDone. Total migrated: ${migrated}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
