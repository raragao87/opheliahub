/**
 * Apply non-Prisma database constraints that can't be expressed in schema.prisma.
 *
 * Idempotent: safe to run repeatedly. Skips constraints that already exist.
 *
 * Run after `prisma db push` to enforce invariants the ORM can't model
 * (CHECK constraints, partial indexes, exclusion constraints, etc.).
 *
 * Usage: pnpm db:apply-constraints
 */
import { prisma } from "../src/lib/prisma";

interface DbConstraint {
  name: string;
  table: string;
  definition: string; // raw SQL after `ADD CONSTRAINT <name>`
  rationale: string;
}

const CONSTRAINTS: DbConstraint[] = [
  {
    name: "chk_ownership_household_consistency",
    table: "financial_accounts",
    definition: `CHECK (
      (ownership = 'SHARED'   AND "householdId" IS NOT NULL) OR
      (ownership = 'PERSONAL' AND "householdId" IS NULL)
    )`,
    rationale:
      "Privacy invariant: SHARED accounts must have a householdId, PERSONAL accounts must not. " +
      "See CLAUDE.md > Privacy Rules.",
  },
];

async function constraintExists(table: string, name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = $1::regclass AND conname = $2
     ) AS exists`,
    table,
    name
  );
  return rows[0]?.exists === true;
}

async function main() {
  let applied = 0;
  let skipped = 0;

  for (const c of CONSTRAINTS) {
    const exists = await constraintExists(c.table, c.name);
    if (exists) {
      console.log(`[skip] ${c.table}.${c.name} (already exists)`);
      skipped++;
      continue;
    }

    console.log(`[apply] ${c.table}.${c.name} — ${c.rationale}`);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${c.table}" ADD CONSTRAINT "${c.name}" ${c.definition}`
    );
    applied++;
  }

  console.log(`\nDone. Applied ${applied}, skipped ${skipped}.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Failed to apply constraints:", e);
  process.exit(1);
});
