import type { PrismaClient, Prisma } from "@prisma/client";
import { ACCOUNT_TYPE_META } from "@/lib/account-types";

interface AccountBreakdownItem {
  accountId: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
}

/**
 * Takes a snapshot of the current net worth for a user/household.
 * Upserts — safe to re-run after a late import to stay accurate.
 */
export async function captureNetWorthSnapshot(
  prisma: PrismaClient,
  householdId: string,
  userId: string,
  visibility: "SHARED" | "PERSONAL",
  year: number,
  month: number
) {
  // Fetch visible accounts based on visibility scope
  const accounts = await prisma.financialAccount.findMany({
    where:
      visibility === "SHARED"
        ? { householdId, ownership: "SHARED", isActive: true }
        : { ownerId: userId, ownership: "PERSONAL", isActive: true },
    select: {
      id: true,
      name: true,
      type: true,
      balance: true,
      currency: true,
    },
  });

  const assetAccounts = accounts.filter((a) => !ACCOUNT_TYPE_META[a.type]?.isLiability);
  const liabilityAccounts = accounts.filter((a) => ACCOUNT_TYPE_META[a.type]?.isLiability);

  const totalAssets = assetAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + Math.abs(a.balance), 0);
  const netWorth = totalAssets - totalLiabilities;

  const accountBreakdown: AccountBreakdownItem[] = accounts.map((a) => ({
    accountId: a.id,
    name: a.name,
    type: a.type,
    balance: a.balance,
    currency: a.currency,
  }));

  return prisma.netWorthSnapshot.upsert({
    where: {
      householdId_userId_year_month_visibility: {
        householdId,
        userId,
        year,
        month,
        visibility,
      },
    },
    create: {
      householdId,
      userId,
      year,
      month,
      visibility,
      totalAssets,
      totalLiabilities,
      netWorth,
      accountBreakdown: accountBreakdown as unknown as Prisma.InputJsonValue,
    },
    update: {
      totalAssets,
      totalLiabilities,
      netWorth,
      accountBreakdown: accountBreakdown as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Computes what an account's balance was at the end of a given month
 * by subtracting transactions that occurred AFTER that month from the current balance.
 */
async function computeHistoricalBalance(
  prisma: PrismaClient,
  accountId: string,
  year: number,
  month: number,
  currentBalance: number
): Promise<number> {
  const endOfMonth = new Date(year, month, 1); // start of next month = end of this month

  const { _sum } = await prisma.transaction.aggregate({
    where: {
      accountId,
      date: { gte: endOfMonth },
    },
    _sum: { amount: true },
  });

  const sumAfter = _sum.amount ?? 0;
  return currentBalance - sumAfter;
}

/**
 * Backfills snapshots for the past N months using computed historical balances.
 * For each month, reconstructs balances by subtracting transactions that came after.
 */
export async function backfillNetWorthSnapshots(
  prisma: PrismaClient,
  householdId: string,
  userId: string,
  visibility: "SHARED" | "PERSONAL",
  monthsBack: number
): Promise<number> {
  const accounts = await prisma.financialAccount.findMany({
    where:
      visibility === "SHARED"
        ? { householdId, ownership: "SHARED", isActive: true }
        : { ownerId: userId, ownership: "PERSONAL", isActive: true },
    select: { id: true, name: true, type: true, balance: true, currency: true },
  });

  const now = new Date();
  let created = 0;

  for (let i = 1; i <= monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1; // 1-based

    // Compute historical balances for each account
    const historicalAccounts = await Promise.all(
      accounts.map(async (a) => {
        const historicalBalance = await computeHistoricalBalance(
          prisma, a.id, year, month, a.balance
        );
        return { ...a, balance: historicalBalance };
      })
    );

    const assetAccounts = historicalAccounts.filter((a) => !ACCOUNT_TYPE_META[a.type]?.isLiability);
    const liabilityAccounts = historicalAccounts.filter((a) => ACCOUNT_TYPE_META[a.type]?.isLiability);

    const totalAssets = assetAccounts.reduce((sum, a) => sum + a.balance, 0);
    const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + Math.abs(a.balance), 0);
    const netWorth = totalAssets - totalLiabilities;

    const accountBreakdown: AccountBreakdownItem[] = historicalAccounts.map((a) => ({
      accountId: a.id,
      name: a.name,
      type: a.type,
      balance: a.balance,
      currency: a.currency,
    }));

    await prisma.netWorthSnapshot.upsert({
      where: {
        householdId_userId_year_month_visibility: {
          householdId, userId, year, month, visibility,
        },
      },
      create: { householdId, userId, year, month, visibility, totalAssets, totalLiabilities, netWorth, accountBreakdown: accountBreakdown as unknown as Prisma.InputJsonValue },
      update: { totalAssets, totalLiabilities, netWorth, accountBreakdown: accountBreakdown as unknown as Prisma.InputJsonValue },
    });
    created++;
  }

  return created;
}
