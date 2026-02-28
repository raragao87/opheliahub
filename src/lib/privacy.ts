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
 * Transactions visible to a user:
 * - All own transactions (any visibility)
 * - Other users' SHARED transactions within the same household
 */
export function visibleTransactionsWhere(
  userId: string,
  householdId: string
): Prisma.TransactionWhereInput {
  return {
    OR: [
      // All own transactions (personal + shared)
      { userId },
      // Other users' SHARED transactions within the household
      {
        visibility: "SHARED",
        account: {
          OR: [
            // From shared/joint accounts
            { householdId, ownership: "SHARED" },
            // From personal accounts but marked as SHARED visibility
            {
              owner: {
                householdMembers: {
                  some: { householdId, inviteStatus: "ACCEPTED" },
                },
              },
            },
          ],
        },
      },
    ],
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

