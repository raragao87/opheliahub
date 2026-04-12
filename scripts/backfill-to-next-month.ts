/**
 * Backfill toNextMonth on all trackers in chronological order.
 * Run with: npx tsx scripts/backfill-to-next-month.ts
 */
import { PrismaClient } from "@prisma/client";
import { getMonthRange } from "../src/lib/date";

const LIQUID_TYPES = ["CHECKING", "SAVINGS", "CREDIT_CARD", "CASH"] as const;

const prisma = new PrismaClient();

async function computeToNextMonth(tracker: {
  id: string;
  month: number;
  year: number;
  householdId: string;
  userId: string;
  visibility: string;
}, prevToNextMonth: number): Promise<number> {
  const { start, end } = getMonthRange(tracker.year, tracker.month);
  const carryForward = prevToNextMonth;

  // Get leaf categories by type
  const leafCats = await prisma.category.findMany({
    where: { householdId: tracker.householdId, parentId: { not: null }, visibility: tracker.visibility as any },
    select: { id: true, type: true },
  });
  const incomeCatIds = new Set(leafCats.filter(c => c.type === "INCOME").map(c => c.id));

  // Get allocations
  const allocs = await prisma.trackerAllocation.findMany({
    where: { trackerId: tracker.id },
    include: { category: { select: { type: true } } },
  });
  const incomeAllocated = allocs.filter(a => a.category.type === "INCOME").reduce((s, a) => s + a.amount, 0);
  const expenseAllocated = allocs.filter(a => a.category.type === "EXPENSE").reduce((s, a) => s + a.amount, 0);

  // Fund allocations
  const fundAgg = await prisma.fundTrackerAllocation.aggregate({
    where: { trackerId: tracker.id },
    _sum: { amount: true },
  });
  const fundAllocated = fundAgg._sum.amount ?? 0;

  // Visibility filter
  const visFilter = tracker.visibility === "SHARED"
    ? {
        OR: [
          { visibility: "SHARED" as const, account: { householdId: tracker.householdId } },
          { visibility: "PERSONAL" as const, userId: tracker.userId },
        ],
      }
    : { userId: tracker.userId, visibility: "PERSONAL" as const };

  // Get actual transactions
  const txns = await prisma.transaction.findMany({
    where: {
      AND: [
        visFilter,
        { account: { type: { in: [...LIQUID_TYPES] } } },
        {
          OR: [
            { accrualDate: { gte: start, lte: end } },
            { accrualDate: null, date: { gte: start, lte: end } },
          ],
        },
        { type: { in: ["INCOME", "EXPENSE", "INVESTMENT"] as const } },
        { isInitialBalance: false },
      ],
    },
    select: { amount: true, type: true, effectiveCategoryId: true },
  });

  let actualIncome = 0;
  let actualInvestment = 0;
  let totalActualExpenses = 0;
  for (const tx of txns) {
    switch (tx.type) {
      case "INCOME":
        actualIncome += tx.amount;
        break;
      case "INVESTMENT":
        actualInvestment += tx.amount;
        break;
      case "EXPENSE":
        totalActualExpenses += Math.abs(tx.amount);
        break;
    }
  }

  // Carry-out = carryIn + actualIncome + actualInvestment - actualExpenses - fundAllocations
  return carryForward + actualIncome + actualInvestment - totalActualExpenses - fundAllocated;
}

async function main() {
  const trackers = await prisma.tracker.findMany({
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  // Group by chain key
  const chains = new Map<string, typeof trackers>();
  for (const t of trackers) {
    const key = `${t.householdId}:${t.userId}:${t.visibility}`;
    if (!chains.has(key)) chains.set(key, []);
    chains.get(key)!.push(t);
  }

  let updated = 0;
  for (const [, chain] of chains) {
    let prevToNextMonth = 0;
    for (const tracker of chain) {
      const toNextMonth = await computeToNextMonth(tracker, prevToNextMonth);
      await prisma.tracker.update({
        where: { id: tracker.id },
        data: { toNextMonth },
      });
      prevToNextMonth = toNextMonth;
      updated++;
    }
  }

  console.log(`Updated toNextMonth on ${updated} trackers`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
