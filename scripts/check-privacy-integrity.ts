/**
 * Audit FinancialAccount rows for the ownership ↔ householdId invariant.
 *
 * Invariant:
 *   ownership = 'SHARED'   ⟹ householdId IS NOT NULL
 *   ownership = 'PERSONAL' ⟹ householdId IS NULL
 *
 * Exit code 0 if all rows comply, 1 if any violations.
 *
 * Usage: pnpm check:privacy-integrity
 */
import { prisma } from "../src/lib/prisma";

interface ViolationRow {
  id: string;
  name: string;
  ownerId: string;
  ownership: string;
  householdId: string | null;
  createdAt: Date;
}

async function main() {
  const sharedWithoutHousehold = await prisma.financialAccount.findMany({
    where: { ownership: "SHARED", householdId: null },
    select: { id: true, name: true, ownerId: true, ownership: true, householdId: true, createdAt: true },
  });

  const personalWithHousehold = await prisma.financialAccount.findMany({
    where: { ownership: "PERSONAL", householdId: { not: null } },
    select: { id: true, name: true, ownerId: true, ownership: true, householdId: true, createdAt: true },
  });

  const totalViolations = sharedWithoutHousehold.length + personalWithHousehold.length;

  console.log(`Privacy integrity audit: ${totalViolations} violation(s) found`);

  if (sharedWithoutHousehold.length > 0) {
    console.log(`\nSHARED accounts with NULL householdId (${sharedWithoutHousehold.length}):`);
    for (const row of sharedWithoutHousehold as ViolationRow[]) {
      console.log(`  ${row.id} | ${row.name} | owner=${row.ownerId} | created=${row.createdAt.toISOString()}`);
    }
  }

  if (personalWithHousehold.length > 0) {
    console.log(`\nPERSONAL accounts with non-null householdId (${personalWithHousehold.length}):`);
    for (const row of personalWithHousehold as ViolationRow[]) {
      console.log(`  ${row.id} | ${row.name} | owner=${row.ownerId} | household=${row.householdId} | created=${row.createdAt.toISOString()}`);
    }
  }

  await prisma.$disconnect();
  process.exit(totalViolations > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
