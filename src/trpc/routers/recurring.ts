import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";
import {
  visibleRecurringRulesWhere,
  visibleTransactionsWhere,
} from "@/lib/privacy";
import { getMonthRange } from "@/lib/date";
import {
  isRuleDueInMonth,
  getExpectedDueDate,
  getInstallmentNumber,
  computeStatus,
  findMatchingTransaction,
  computeNextDueDate,
  detectRecurringPatterns,
  extractDisplayName,
  computeBestDueDay,
} from "@/lib/recurring";
import { subMonths } from "date-fns";
import type { PrismaClient, RecurringRule } from "@prisma/client";
import { LIQUID_ACCOUNT_TYPES } from "@/lib/account-types";

/**
 * Propagates a category change to all matching transactions.
 * Matches by counterparty name (extracted from the rule's raw bank description)
 * + account + type. Uses `rule.description` (raw bank text) to extract the
 * counterparty, so renaming the rule (e.g. "ABN AMRO BANK NV" → "Mortgage")
 * doesn't break matching.
 */
async function propagateCategoryToTransactions(
  prisma: PrismaClient,
  rule: Pick<RecurringRule, "name" | "description" | "accountId" | "type" | "amount" | "categoryId">,
  userId: string,
  householdId: string
) {
  if (!rule.categoryId) return 0;

  // Extract the counterparty name from the stored raw bank description.
  // Fall back to rule.name if no description is stored (manually created rules).
  const counterparty = (
    rule.description
      ? extractDisplayName(rule.description)
      : rule.name
  ).toLowerCase();

  // Fetch all transactions for the same account + type, scoped by visibility.
  // We filter by counterparty name in JS (needed anyway), so also
  // skip the SQL category filter — Prisma's NOT doesn't match NULLs.
  const transactions = await prisma.transaction.findMany({
    where: {
      accountId: rule.accountId,
      type: rule.type,
      ...visibleTransactionsWhere(userId, householdId),
    },
    select: { id: true, description: true, amount: true, categoryId: true },
  });

  // Filter by matching counterparty name AND not already correct category.
  // Also check amount proximity (within 2×) to avoid cross-contaminating
  // different recurring items from the same counterparty (e.g. a €2,900
  // contribution vs a €1,400 subsidy from the same person).
  const ruleAmt = Math.abs(rule.amount);
  const matchingIds = transactions
    .filter((tx) => {
      if (tx.categoryId === rule.categoryId) return false; // already correct
      const txName = extractDisplayName(tx.description).toLowerCase();
      if (txName !== counterparty) return false;
      // Amount proximity check
      if (ruleAmt > 0) {
        const txAmt = Math.abs(tx.amount);
        const ratio =
          Math.max(txAmt, ruleAmt) /
          Math.max(Math.min(txAmt, ruleAmt), 1);
        if (ratio > 2) return false;
      }
      return true;
    })
    .map((tx) => tx.id);

  if (matchingIds.length === 0) return 0;

  const result = await prisma.transaction.updateMany({
    where: { id: { in: matchingIds } },
    data: { categoryId: rule.categoryId },
  });

  return result.count;
}

export const recurringRouter = router({
  /** Detect recurring patterns from transaction history */
  detect: householdProcedure
    .input(
      z.object({
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .query(async ({ ctx, input }) => {
      const lookbackMonths = 12;
      const since = subMonths(new Date(), lookbackMonths);

      const visibilityFilter =
        input.visibility === "SHARED"
          ? visibleTransactionsWhere(ctx.userId, ctx.householdId)
          : { userId: ctx.userId, visibility: "PERSONAL" as const };

      // Fetch transactions from the last 12 months (liquid accounts only)
      const transactions = await ctx.prisma.transaction.findMany({
        where: {
          ...visibilityFilter,
          account: { type: { in: LIQUID_ACCOUNT_TYPES } },
          date: { gte: since },
        },
        select: {
          id: true,
          description: true,
          amount: true,
          type: true,
          date: true,
          accountId: true,
          categoryId: true,
          account: { select: { name: true } },
          category: { select: { name: true, icon: true } },
        },
        orderBy: { date: "desc" },
      });

      // Get ALL existing rules (active + inactive) to filter out already-tracked patterns.
      // Including inactive ones prevents deactivated rules from reappearing as suggestions.
      const existingRules = await ctx.prisma.recurringRule.findMany({
        where: {
          ...visibleRecurringRulesWhere(ctx.userId, ctx.householdId),
          visibility: input.visibility,
        },
        select: { name: true, description: true, accountId: true, type: true, amount: true },
      });

      const patterns = detectRecurringPatterns(
        transactions.map((tx) => ({
          id: tx.id,
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          date: tx.date,
          accountId: tx.accountId,
          accountName: tx.account.name,
          categoryId: tx.categoryId,
          categoryName: tx.category?.name ?? null,
          categoryIcon: tx.category?.icon ?? null,
        }))
      );

      // Filter out patterns that already have a matching recurring rule.
      // Match by counterparty name + account + type + amount proximity.
      // Amount check (ratio ≤ 2) prevents filtering out genuinely different
      // recurring payments from the same counterparty (e.g. motorcycle tax
      // vs car tax from Belastingdienst).
      const FILTER_AMOUNT_RATIO = 2;
      const filtered = patterns.filter((pattern) => {
        return !existingRules.some((rule) => {
          const ruleCounterparty = (
            rule.description
              ? extractDisplayName(rule.description)
              : rule.name
          ).toLowerCase();
          const patternName = pattern.name.toLowerCase();

          const nameMatch =
            rule.name.toLowerCase() === patternName ||
            ruleCounterparty === patternName;
          const accountMatch = rule.accountId === pattern.accountId;
          const typeMatch = rule.type === pattern.type;

          if (!nameMatch || !accountMatch || !typeMatch) return false;

          // If amounts are far apart, these are different recurring items
          // from the same counterparty — don't filter out the pattern.
          const ruleAmt = Math.abs(rule.amount);
          const patternAmt = pattern.amount;
          if (ruleAmt > 0 && patternAmt > 0) {
            const ratio =
              Math.max(ruleAmt, patternAmt) /
              Math.max(Math.min(ruleAmt, patternAmt), 1);
            if (ratio > FILTER_AMOUNT_RATIO) return false;
          }

          return true;
        });
      });

      // Fetch which of these patterns the user has dismissed
      const dismissed = await ctx.prisma.dismissedRecurringPattern.findMany({
        where: { userId: ctx.userId, visibility: input.visibility },
        select: { patternKey: true },
      });
      const dismissedKeys = dismissed.map((d) => d.patternKey);

      return { patterns: filtered, dismissedKeys };
    }),

  /** Persist a dismissed pattern suggestion so it doesn't reappear */
  dismiss: householdProcedure
    .input(
      z.object({
        patternKey: z.string(),
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.dismissedRecurringPattern.upsert({
        where: {
          patternKey_userId_visibility: {
            patternKey: input.patternKey,
            userId: ctx.userId,
            visibility: input.visibility,
          },
        },
        create: {
          patternKey: input.patternKey,
          userId: ctx.userId,
          householdId: ctx.householdId,
          visibility: input.visibility,
        },
        update: {},
      });
    }),

  /** Restore a previously dismissed pattern so it appears again */
  undismiss: householdProcedure
    .input(
      z.object({
        patternKey: z.string(),
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.dismissedRecurringPattern.deleteMany({
        where: {
          patternKey: input.patternKey,
          userId: ctx.userId,
          visibility: input.visibility,
        },
      });
    }),

  /** List all recurring rules (for management, future use) */
  list: householdProcedure
    .input(
      z.object({
        visibility: z.enum(["SHARED", "PERSONAL"]).optional(),
        includeInactive: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.recurringRule.findMany({
        where: {
          ...visibleRecurringRulesWhere(ctx.userId, ctx.householdId),
          ...(input.visibility && { visibility: input.visibility }),
          ...(!input.includeInactive && { isActive: true }),
          account: { type: { in: LIQUID_ACCOUNT_TYPES } },
        },
        orderBy: { nextDueDate: "asc" },
        include: {
          account: { select: { id: true, name: true, type: true } },
          category: { select: { id: true, name: true, icon: true, color: true } },
        },
      });
    }),

  /** List recurring rules due in a specific month with auto-matched status */
  listForMonth: householdProcedure
    .input(
      z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2020).max(2100),
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .query(async ({ ctx, input }) => {
      // 1. Fetch all active recurring rules (liquid accounts only)
      const allRules = await ctx.prisma.recurringRule.findMany({
        where: {
          ...visibleRecurringRulesWhere(ctx.userId, ctx.householdId),
          visibility: input.visibility,
          isActive: true,
          account: { type: { in: LIQUID_ACCOUNT_TYPES } },
        },
        include: {
          account: { select: { id: true, name: true, type: true } },
          category: {
            select: { id: true, name: true, icon: true, color: true },
          },
        },
      });

      // 2. Filter to rules due in this month
      const dueRules = allRules.filter((rule) =>
        isRuleDueInMonth(rule, input.year, input.month)
      );

      // 3. Fetch transactions for this month + a buffer for boundary matching.
      //    Payments due near month boundaries often arrive a few days early/late
      //    (e.g., a Feb payment processed on Jan 30). The ±4 day tolerance in
      //    findMatchingTransaction ensures only the correct month claims each tx.
      const { start, end } = getMonthRange(input.year, input.month);
      const BUFFER_MS = 5 * 86_400_000; // 5 days in ms
      const bufferedStart = new Date(start.getTime() - BUFFER_MS);
      const bufferedEnd = new Date(end.getTime() + BUFFER_MS);

      const visibilityFilter =
        input.visibility === "SHARED"
          ? visibleTransactionsWhere(ctx.userId, ctx.householdId)
          : { userId: ctx.userId, visibility: "PERSONAL" as const };

      const monthTransactions = await ctx.prisma.transaction.findMany({
        where: {
          ...visibilityFilter,
          date: { gte: bufferedStart, lte: bufferedEnd },
        },
        select: {
          id: true,
          accountId: true,
          amount: true,
          date: true,
          description: true,
        },
      });

      // 3b. For each rule, find the latest actual transaction for that
      //     counterparty — used for: expected amount + staleness detection.
      //     Only consider transactions up to the end of the selected month,
      //     so navigating to past months shows period-correct expected amounts.
      const ruleAccountIds = [...new Set(dueRules.map((r) => r.accountId))];
      const recentTransactions =
        ruleAccountIds.length > 0
          ? await ctx.prisma.transaction.findMany({
              where: {
                accountId: { in: ruleAccountIds },
                date: { lte: end },
              },
              orderBy: { date: "desc" },
              take: 500,
              select: {
                accountId: true,
                description: true,
                amount: true,
                date: true,
                type: true,
              },
            })
          : [];

      const latestAmountByRule = new Map<string, number>();
      const lastSeenByRule = new Map<string, Date>();
      const bestDueDayByRule = new Map<string, number>();
      for (const rule of dueRules) {
        const counterparty = (
          rule.description
            ? extractDisplayName(rule.description)
            : rule.name
        ).toLowerCase();

        const matchingTxs = recentTransactions.filter(
          (tx) =>
            tx.accountId === rule.accountId &&
            tx.type === rule.type &&
            extractDisplayName(tx.description).toLowerCase() === counterparty
        );

        // Narrow to transactions whose amount is within 2× of the rule's amount.
        // This prevents false matches when the same counterparty has multiple
        // recurring charges at very different amounts (e.g. a €2,900 contribution
        // vs a €1,400 subsidy from the same person).
        const ruleAmt = Math.abs(rule.amount);
        const amountMatchingTxs = ruleAmt > 0
          ? matchingTxs.filter((tx) => {
              const txAmt = Math.abs(tx.amount);
              const ratio = Math.max(txAmt, ruleAmt) / Math.max(Math.min(txAmt, ruleAmt), 1);
              return ratio <= 2;
            })
          : matchingTxs;
        const effectiveTxs = amountMatchingTxs.length > 0 ? amountMatchingTxs : matchingTxs;

        if (effectiveTxs.length > 0) {
          // Latest transaction: amount + last seen date
          latestAmountByRule.set(rule.id, Math.abs(effectiveTxs[0].amount));
          lastSeenByRule.set(rule.id, effectiveTxs[0].date);

          // Best due day: compute from ALL matching transaction dates.
          // This dynamically corrects the expected due date even if
          // the rule's startDate was set to an atypical day.
          if (effectiveTxs.length >= 3) {
            bestDueDayByRule.set(
              rule.id,
              computeBestDueDay(effectiveTxs.map((tx) => tx.date))
            );
          }
        }
      }

      // 3c. Auto-detect stale rules: no matching transaction in the 2 months
      //     before the selected month (period-relative, not always "now")
      const periodDate = new Date(input.year, input.month - 1, 1);
      const twoMonthsAgo = subMonths(periodDate, 2);

      // 4. For each rule, find matching transaction and compute status
      //    Use end-of-month for past months so status is PAID/OVERDUE
      //    based on the period, not today.
      const realNow = new Date();
      const now = end < realNow ? end : realNow;
      const usedTransactionIds = new Set<string>();

      const rules = dueRules.map((rule) => {
        // Use the dynamically computed best due day if we have enough history,
        // otherwise fall back to the rule's startDate day.
        const dynamicDay = bestDueDayByRule.get(rule.id);
        const expectedDueDate = getExpectedDueDate(
          rule,
          input.year,
          input.month,
          dynamicDay
        );
        const installmentNumber = getInstallmentNumber(
          rule,
          input.year,
          input.month
        );

        // Filter out already-used transactions to avoid double-matching
        const availableTransactions = monthTransactions.filter(
          (tx) => !usedTransactionIds.has(tx.id)
        );

        // Use the latest amount (if available) for matching, so price
        // changes don't prevent finding the current-month transaction.
        const ruleForMatching = latestAmountByRule.has(rule.id)
          ? { ...rule, amount: latestAmountByRule.get(rule.id)! }
          : rule;

        const matchedTx = findMatchingTransaction(
          ruleForMatching,
          expectedDueDate,
          availableTransactions
        );

        if (matchedTx) {
          usedTransactionIds.add(matchedTx.id);
        }

        const status = computeStatus(expectedDueDate, !!matchedTx, now);

        // Use the latest actual transaction amount as the expected amount,
        // falling back to the static rule amount if no history exists.
        const expectedAmount =
          latestAmountByRule.get(rule.id) ?? rule.amount;

        // Auto-detect stale: last matching transaction is older than 2 months.
        // Newly created rules (within 30 days) are never auto-staled — they
        // won't have transaction history yet.
        const lastSeen = lastSeenByRule.get(rule.id) ?? null;
        const ruleAgeMs = realNow.getTime() - new Date(rule.createdAt).getTime();
        const isNewRule = ruleAgeMs < 30 * 24 * 60 * 60 * 1000; // 30 days
        const isStale =
          !isNewRule && lastSeen !== null && lastSeen < twoMonthsAgo;

        return {
          id: rule.id,
          name: rule.name,
          description: rule.description,
          amount: expectedAmount,
          type: rule.type,
          frequency: rule.frequency,
          startDate: rule.startDate,
          totalInstallments: rule.totalInstallments,
          categoryId: rule.categoryId,
          accountId: rule.accountId,
          visibility: rule.visibility,
          isActive: rule.isActive,
          account: rule.account,
          category: rule.category,
          expectedDueDate,
          installmentNumber,
          status: isStale ? ("INACTIVE" as const) : status,
          lastSeenDate: lastSeen,
          matchedTransaction: matchedTx
            ? {
                id: matchedTx.id,
                amount: matchedTx.amount,
                date: matchedTx.date,
                description: matchedTx.description,
              }
            : null,
        };
      });

      // Separate auto-detected stale rules from truly active ones
      const activeRules = rules.filter((r) => r.status !== "INACTIVE");
      const autoInactiveRules = rules.filter((r) => r.status === "INACTIVE");

      // Sort active: overdue first, then pending, then paid; within same status by due date
      const statusOrder: Record<string, number> = {
        OVERDUE: 0,
        PENDING: 1,
        PAID: 2,
      };
      activeRules.sort((a, b) => {
        const so = statusOrder[a.status] - statusOrder[b.status];
        if (so !== 0) return so;
        return a.expectedDueDate.getTime() - b.expectedDueDate.getTime();
      });

      // 5. Fetch DB-inactive rules that share a category with any active rule
      const allCategoryIds = [
        ...new Set(
          [...activeRules, ...autoInactiveRules]
            .filter((r) => r.categoryId)
            .map((r) => r.categoryId!)
        ),
      ];

      const dbInactiveSiblings =
        allCategoryIds.length > 0
          ? await ctx.prisma.recurringRule.findMany({
              where: {
                ...visibleRecurringRulesWhere(ctx.userId, ctx.householdId),
                visibility: input.visibility,
                isActive: false,
                categoryId: { in: allCategoryIds },
              },
              include: {
                account: { select: { id: true, name: true, type: true } },
                category: {
                  select: { id: true, name: true, icon: true, color: true },
                },
              },
            })
          : [];

      // 5b. Batch-compute lastSeenDate for DB-inactive rules
      const dbInactiveAccountIds = [
        ...new Set(dbInactiveSiblings.map((r) => r.accountId)),
      ];
      const dbInactiveRecentTxs =
        dbInactiveAccountIds.length > 0
          ? await ctx.prisma.transaction.findMany({
              where: {
                accountId: { in: dbInactiveAccountIds },
                date: { lte: end },
              },
              orderBy: { date: "desc" },
              take: 1000,
              select: {
                accountId: true,
                description: true,
                date: true,
                type: true,
              },
            })
          : [];

      const lastSeenMap = new Map<string, Date>();
      for (const rule of dbInactiveSiblings) {
        const counterparty = (
          rule.description
            ? extractDisplayName(rule.description)
            : rule.name
        ).toLowerCase();

        const match = dbInactiveRecentTxs.find(
          (tx) =>
            tx.accountId === rule.accountId &&
            tx.type === rule.type &&
            extractDisplayName(tx.description).toLowerCase() === counterparty
        );
        if (match) lastSeenMap.set(rule.id, match.date);
      }

      // 5c. Merge: auto-detected stale rules + DB-inactive siblings
      const inactiveRules = [
        // Auto-detected stale (still isActive in DB but no recent transactions)
        ...autoInactiveRules.map((rule) => ({
          ...rule,
          lastSeenDate: rule.lastSeenDate as Date | null,
        })),
        // Explicitly marked inactive in DB
        ...dbInactiveSiblings.map((rule) => ({
          id: rule.id,
          name: rule.name,
          description: rule.description,
          amount: rule.amount,
          type: rule.type,
          frequency: rule.frequency,
          startDate: rule.startDate,
          totalInstallments: rule.totalInstallments,
          categoryId: rule.categoryId,
          accountId: rule.accountId,
          visibility: rule.visibility,
          isActive: false as const,
          account: rule.account,
          category: rule.category,
          lastSeenDate: lastSeenMap.get(rule.id) ?? null,
          expectedDueDate: null as Date | null,
          installmentNumber: null as number | null,
          status: "INACTIVE" as const,
          matchedTransaction: null as null,
        })),
      ];

      // 6. Compute summary (only truly active rules — not stale)
      let totalExpected = 0;
      let totalPaid = 0;
      let totalPending = 0;
      let incomeExpected = 0;
      let incomePaid = 0;

      for (const rule of activeRules) {
        const absAmount = Math.abs(rule.amount);
        if (rule.type === "INCOME") {
          incomeExpected += absAmount;
          if (rule.matchedTransaction) {
            incomePaid += Math.abs(rule.matchedTransaction.amount);
          }
        } else {
          totalExpected += absAmount;
          if (rule.matchedTransaction) {
            totalPaid += Math.abs(rule.matchedTransaction.amount);
          } else {
            totalPending += absAmount;
          }
        }
      }

      return {
        rules: activeRules,
        inactiveRules,
        summary: {
          totalExpected,
          totalPaid,
          totalPending,
          incomeExpected,
          incomePaid,
        },
      };
    }),

  create: householdProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(200).optional(),
        amount: z.number().int().min(1),
        type: z.enum(["INCOME", "EXPENSE"]),
        frequency: z.enum([
          "DAILY",
          "WEEKLY",
          "BIWEEKLY",
          "MONTHLY",
          "QUARTERLY",
          "YEARLY",
        ]),
        startDate: z.coerce.date(),
        totalInstallments: z.number().int().min(2).optional(),
        categoryId: z.string().optional(),
        accountId: z.string(),
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify account belongs to user/household
      const account = await ctx.prisma.financialAccount.findFirst({
        where: { id: input.accountId },
      });
      if (!account) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
      }

      // Prevent duplicates: check if a rule with the same counterparty + account
      // + type + similar amount already exists.
      const counterparty = (
        input.description
          ? extractDisplayName(input.description)
          : input.name
      ).toLowerCase();

      const existingRules = await ctx.prisma.recurringRule.findMany({
        where: {
          accountId: input.accountId,
          type: input.type,
          householdId: ctx.householdId,
          visibility: input.visibility,
        },
        select: { name: true, description: true, amount: true },
      });

      const isDuplicate = existingRules.some((rule) => {
        const ruleCounterparty = (
          rule.description
            ? extractDisplayName(rule.description)
            : rule.name
        ).toLowerCase();
        if (ruleCounterparty !== counterparty) return false;
        const ratio =
          Math.max(rule.amount, input.amount) /
          Math.max(Math.min(rule.amount, input.amount), 1);
        return ratio <= 2;
      });

      if (isDuplicate) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A similar recurring rule already exists for this counterparty.",
        });
      }

      const nextDueDate = computeNextDueDate(input.startDate, input.frequency);

      const created = await ctx.prisma.recurringRule.create({
        data: {
          name: input.name,
          description: input.description,
          amount: input.amount,
          type: input.type,
          frequency: input.frequency,
          startDate: input.startDate,
          totalInstallments: input.totalInstallments,
          categoryId: input.categoryId,
          accountId: input.accountId,
          householdId: ctx.householdId,
          userId: ctx.userId,
          visibility: input.visibility,
          nextDueDate,
        },
        include: {
          account: { select: { id: true, name: true, type: true } },
          category: { select: { id: true, name: true, icon: true, color: true } },
        },
      });

      // Propagate category to all matching transactions
      if (input.categoryId) {
        await propagateCategoryToTransactions(ctx.prisma as PrismaClient, {
          name: created.name,
          description: created.description,
          accountId: created.accountId,
          type: created.type,
          amount: created.amount,
          categoryId: created.categoryId,
        }, ctx.userId, ctx.householdId);
      }

      return created;
    }),

  update: householdProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(200).optional(),
        amount: z.number().int().min(1).optional(),
        type: z.enum(["INCOME", "EXPENSE"]).optional(),
        frequency: z
          .enum([
            "DAILY",
            "WEEKLY",
            "BIWEEKLY",
            "MONTHLY",
            "QUARTERLY",
            "YEARLY",
          ])
          .optional(),
        startDate: z.coerce.date().optional(),
        totalInstallments: z.number().int().min(2).nullable().optional(),
        categoryId: z.string().nullable().optional(),
        accountId: z.string().optional(),
        isActive: z.boolean().optional(),
        visibility: z.enum(["SHARED", "PERSONAL"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const rule = await ctx.prisma.recurringRule.findFirst({
        where: { id, userId: ctx.userId },
      });

      if (!rule) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Recompute nextDueDate if frequency or startDate changed
      const updateData: Record<string, unknown> = { ...data };
      if (input.frequency || input.startDate) {
        const freq = input.frequency ?? rule.frequency;
        const start = input.startDate ?? rule.startDate;
        updateData.nextDueDate = computeNextDueDate(start, freq);
      }

      const updated = await ctx.prisma.recurringRule.update({
        where: { id },
        data: updateData,
        include: {
          account: { select: { id: true, name: true, type: true } },
          category: { select: { id: true, name: true, icon: true, color: true } },
        },
      });

      // Propagate category to all matching transactions.
      // Runs whenever the saved rule has a category — the function itself
      // skips transactions that already have the correct category, so
      // this is safe to call on every save.
      if (updated.categoryId) {
        await propagateCategoryToTransactions(ctx.prisma as PrismaClient, {
          name: updated.name,
          description: updated.description,
          accountId: updated.accountId,
          type: updated.type,
          amount: updated.amount,
          categoryId: updated.categoryId,
        }, ctx.userId, ctx.householdId);
      }

      return updated;
    }),

  /** Re-runs category propagation for a rule without changing any fields. */
  reapplyCategory: householdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rule = await ctx.prisma.recurringRule.findFirst({
        where: { id: input.id, userId: ctx.userId },
      });

      if (!rule) throw new TRPCError({ code: "NOT_FOUND" });
      if (!rule.categoryId) return { count: 0 };

      const count = await propagateCategoryToTransactions(ctx.prisma as PrismaClient, rule, ctx.userId, ctx.householdId);
      return { count };
    }),

  delete: householdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rule = await ctx.prisma.recurringRule.findFirst({
        where: { id: input.id, userId: ctx.userId },
      });

      if (!rule) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return ctx.prisma.recurringRule.delete({ where: { id: input.id } });
    }),
});
