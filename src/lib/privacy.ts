import { Prisma } from "@prisma/client";

/**
 * Privacy query helpers — single source of truth for data visibility.
 * Every tRPC router MUST use these helpers to scope queries.
 * Never write raw Prisma queries without privacy filtering.
 */

/** Accounts visible to a user: own personal + all shared in household */
export function visibleAccountsWhere(
  userId: string,
  householdId: string
): Prisma.FinancialAccountWhereInput {
  return {
    isActive: true,
    OR: [
      { ownerId: userId, ownership: "PERSONAL" },
      { householdId, ownership: "SHARED" },
    ],
  };
}

/**
 * Transactions visible to a user — derived from account ownership:
 * - All transactions on accounts the user owns
 * - All transactions on shared accounts in the household
 */
export function visibleTransactionsWhere(
  userId: string,
  householdId: string
): Prisma.TransactionWhereInput {
  return {
    account: {
      OR: [
        { ownerId: userId },
        { householdId, ownership: "SHARED" },
      ],
    },
  };
}

/**
 * Filter transactions by account ownership (SHARED or PERSONAL).
 * Used by tracker, fund, dashboard to separate shared vs personal budgets.
 */
export function transactionOwnershipFilter(
  userId: string,
  householdId: string,
  ownership: "SHARED" | "PERSONAL"
): Prisma.TransactionWhereInput {
  if (ownership === "SHARED") {
    return {
      account: {
        OR: [
          { householdId, ownership: "SHARED" },
          { ownerId: userId, ownership: "SHARED" },
        ],
      },
    };
  }
  return {
    account: { ownerId: userId, ownership: "PERSONAL" },
  };
}

/** Tags visible to a user: own tags + shared tags from household members */
export function visibleTagsWhere(
  userId: string,
  householdId: string
): Prisma.TagWhereInput {
  return {
    OR: [
      { userId },
      {
        visibility: "SHARED",
        user: {
          householdMembers: {
            some: { householdId, inviteStatus: "ACCEPTED" },
          },
        },
      },
    ],
  };
}

/** Trackers visible to a user: own trackers + shared household trackers */
export function visibleTrackersWhere(
  userId: string,
  householdId: string
): Prisma.TrackerWhereInput {
  return {
    OR: [
      { userId },
      { visibility: "SHARED", householdId },
    ],
  };
}

/** Recurring rules visible to a user: own + shared in household */
export function visibleRecurringRulesWhere(
  userId: string,
  householdId: string
): Prisma.RecurringRuleWhereInput {
  return {
    OR: [
      { userId },
      { visibility: "SHARED", householdId },
    ],
  };
}
