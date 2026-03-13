import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";
import {
  visibleTransactionsWhere,
  visibleRecurringRulesWhere,
} from "@/lib/privacy";
import { getMonthRange, getPreviousMonth, getNextMonth } from "@/lib/date";
import {
  isRuleDueInMonth,
  getExpectedDueDate,
  extractDisplayName,
  computeBestDueDay,
} from "@/lib/recurring";
import { LIQUID_ACCOUNT_TYPES } from "@/lib/account-types";

export const trackerRouter = router({
  getOrCreate: householdProcedure
    .input(
      z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2020).max(2100),
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .query(async ({ ctx, input }) => {
      let tracker = await ctx.prisma.tracker.findUnique({
        where: {
          householdId_userId_month_year_visibility: {
            householdId: ctx.householdId,
            userId: ctx.userId,
            month: input.month,
            year: input.year,
            visibility: input.visibility,
          },
        },
        include: {
          allocations: {
            include: {
              category: { select: { id: true, name: true, icon: true, color: true } },
            },
            orderBy: { category: { sortOrder: "asc" } },
          },
        },
      });

      if (!tracker) {
        tracker = await ctx.prisma.tracker.create({
          data: {
            month: input.month,
            year: input.year,
            visibility: input.visibility,
            householdId: ctx.householdId,
            userId: ctx.userId,
          },
          include: {
            allocations: {
              include: {
                category: { select: { id: true, name: true, icon: true, color: true } },
              },
            },
          },
        });
      }

      return tracker;
    }),

  setIncome: householdProcedure
    .input(
      z.object({
        trackerId: z.string(),
        totalIncome: z.number().int().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.tracker.update({
        where: { id: input.trackerId },
        data: { totalIncome: input.totalIncome },
      });
    }),

  setAllocation: householdProcedure
    .input(
      z.object({
        trackerId: z.string(),
        categoryId: z.string(),
        amount: z.number().int().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.trackerAllocation.upsert({
        where: {
          trackerId_categoryId: {
            trackerId: input.trackerId,
            categoryId: input.categoryId,
          },
        },
        update: { amount: input.amount },
        create: {
          trackerId: input.trackerId,
          categoryId: input.categoryId,
          amount: input.amount,
        },
      });
    }),

  getSummary: householdProcedure
    .input(
      z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2020).max(2100),
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .query(async ({ ctx, input }) => {
      const tracker = await ctx.prisma.tracker.findUnique({
        where: {
          householdId_userId_month_year_visibility: {
            householdId: ctx.householdId,
            userId: ctx.userId,
            month: input.month,
            year: input.year,
            visibility: input.visibility,
          },
        },
        include: {
          allocations: {
            include: {
              category: { select: { id: true, name: true, icon: true, color: true } },
            },
          },
        },
      });

      const { start, end } = getMonthRange(input.year, input.month);

      // Visibility filter for transactions
      const visibilityFilter =
        input.visibility === "SHARED"
          ? visibleTransactionsWhere(ctx.userId, ctx.householdId)
          : { userId: ctx.userId, visibility: "PERSONAL" as const };

      // Only consider liquid account transactions for budgeting
      const liquidFilter = { account: { type: { in: LIQUID_ACCOUNT_TYPES } } };

      // Effective date filter: use accrualDate when set, otherwise fall back to date.
      // This allows transactions to be moved to a different budget month without
      // altering the original bank/import date.
      const effectiveDateFilter = (rangeStart: Date, rangeEnd: Date) => ({
        OR: [
          { accrualDate: { gte: rangeStart, lte: rangeEnd } },
          { accrualDate: null, date: { gte: rangeStart, lte: rangeEnd } },
        ],
      });

      // Fetch leaf category IDs by type (used to scope actual income/expense to correct category types)
      const leafCategories = await ctx.prisma.category.findMany({
        where: { householdId: ctx.householdId, parentId: { not: null }, visibility: input.visibility },
        select: { id: true, type: true },
      });
      const incomeCategoryIds = leafCategories.filter((c) => c.type === "INCOME").map((c) => c.id);
      const expenseCategoryIds = leafCategories.filter((c) => c.type === "EXPENSE").map((c) => c.id);

      // Get actual income received this month — only from INCOME-type categories
      const incomeAgg = await ctx.prisma.transaction.aggregate({
        where: {
          AND: [
            visibilityFilter,
            liquidFilter,
            effectiveDateFilter(start, end),
            { type: "INCOME" },
            { categoryId: { in: incomeCategoryIds } },
          ],
        },
        _sum: { amount: true },
      });
      const actualIncome = incomeAgg._sum.amount ?? 0;

      // Get actual spending per category for this month — only EXPENSE-type categories
      const spending = await ctx.prisma.transaction.groupBy({
        by: ["categoryId"],
        where: {
          AND: [
            visibilityFilter,
            liquidFilter,
            effectiveDateFilter(start, end),
            { type: "EXPENSE" },
            { OR: [{ categoryId: { in: expenseCategoryIds } }, { categoryId: null }] },
          ],
        },
        _sum: { amount: true },
      });

      const spendingMap = new Map(
        spending.map((s) => [s.categoryId, Math.abs(s._sum.amount ?? 0)])
      );

      // Get actual income per category for this month (only INCOME-type categories)
      const incomeByCategory = await ctx.prisma.transaction.groupBy({
        by: ["categoryId"],
        where: {
          AND: [
            visibilityFilter,
            liquidFilter,
            effectiveDateFilter(start, end),
            { type: "INCOME" },
            { categoryId: { in: incomeCategoryIds } },
          ],
        },
        _sum: { amount: true },
      });
      const incomeMap = new Map(
        incomeByCategory.map((s) => [s.categoryId, Math.abs(s._sum.amount ?? 0)])
      );

      // ── Recurring-aware boundary adjustments ──────────────────────────
      // Transactions near month boundaries (e.g., a Feb payment on Jan 30)
      // should be attributed to the correct month based on recurring rule
      // matching. We add/subtract from spendingMap before building categories.
      const BUFFER_MS = 5 * 86_400_000; // 5 days
      const DATE_TOLERANCE_MS = 4 * 86_400_000; // ±4 days

      // Fetch boundary-zone expense transactions (uses original date for recurring matching)
      const boundaryTxs = await ctx.prisma.transaction.findMany({
        where: {
          ...visibilityFilter,
          ...liquidFilter,
          type: "EXPENSE",
          date: {
            gte: new Date(start.getTime() - BUFFER_MS),
            lte: new Date(end.getTime() + BUFFER_MS),
          },
        },
        select: {
          id: true,
          accountId: true,
          amount: true,
          date: true,
          description: true,
          categoryId: true,
        },
      });

      const beforeMonthTxs = boundaryTxs.filter((tx) => tx.date < start);
      const afterMonthTxs = boundaryTxs.filter((tx) => tx.date > end);
      const lateMonthTxs = boundaryTxs.filter(
        (tx) =>
          tx.date.getTime() >= end.getTime() - BUFFER_MS && tx.date <= end
      );
      const earlyMonthTxs = boundaryTxs.filter(
        (tx) =>
          tx.date >= start && tx.date.getTime() <= start.getTime() + BUFFER_MS
      );

      // Fetch active recurring rules (expense only)
      const recurringRules = await ctx.prisma.recurringRule.findMany({
        where: {
          ...visibleRecurringRulesWhere(ctx.userId, ctx.householdId),
          visibility: input.visibility,
          isActive: true,
          type: "EXPENSE",
        },
        select: {
          id: true,
          name: true,
          description: true,
          startDate: true,
          frequency: true,
          totalInstallments: true,
          isActive: true,
          accountId: true,
          type: true,
          categoryId: true,
        },
      });

      // Compute best due day per rule from transaction history
      const ruleAccountIds = [
        ...new Set(recurringRules.map((r) => r.accountId)),
      ];
      const recentTxsForDueDay =
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
                date: true,
                type: true,
              },
            })
          : [];

      const bestDueDayByRule = new Map<string, number>();
      for (const rule of recurringRules) {
        const cp = (
          rule.description
            ? extractDisplayName(rule.description)
            : rule.name
        ).toLowerCase();
        const matches = recentTxsForDueDay.filter(
          (tx) =>
            tx.accountId === rule.accountId &&
            tx.type === rule.type &&
            extractDisplayName(tx.description).toLowerCase() === cp
        );
        if (matches.length >= 3) {
          bestDueDayByRule.set(
            rule.id,
            computeBestDueDay(matches.map((tx) => tx.date))
          );
        }
      }

      // Classify rules by month
      const thisMonthRules = recurringRules.filter((r) =>
        isRuleDueInMonth(r, input.year, input.month)
      );
      const { year: prevY, month: prevM } = getPreviousMonth(
        input.year,
        input.month
      );
      const { year: nextY, month: nextM } = getNextMonth(
        input.year,
        input.month
      );
      const prevMonthRules = recurringRules.filter((r) =>
        isRuleDueInMonth(r, prevY, prevM)
      );
      const nextMonthRules = recurringRules.filter((r) =>
        isRuleDueInMonth(r, nextY, nextM)
      );

      // Match helper: does this transaction match a recurring rule's due date?
      function txMatchesRule(
        tx: { accountId: string; date: Date; description: string },
        rule: (typeof recurringRules)[number],
        expectedDue: Date
      ): boolean {
        if (tx.accountId !== rule.accountId) return false;
        const cp = (
          rule.description
            ? extractDisplayName(rule.description)
            : rule.name
        ).toLowerCase();
        const txName = extractDisplayName(tx.description).toLowerCase();
        if (txName !== cp) return false;
        return Math.abs(tx.date.getTime() - expectedDue.getTime()) <= DATE_TOLERANCE_MS;
      }

      // Track per-category adjustments
      const categoryAdj = new Map<string | null, number>();
      function adj(catId: string | null, amount: number) {
        categoryAdj.set(catId, (categoryAdj.get(catId) ?? 0) + amount);
      }

      // 1. ADDITIONS: boundary txs outside strict month that belong here
      for (const tx of [...beforeMonthTxs, ...afterMonthTxs]) {
        for (const rule of thisMonthRules) {
          const due = getExpectedDueDate(
            rule,
            input.year,
            input.month,
            bestDueDayByRule.get(rule.id)
          );
          if (txMatchesRule(tx, rule, due)) {
            adj(tx.categoryId ?? rule.categoryId, Math.abs(tx.amount));
            break;
          }
        }
      }

      // 2. SUBTRACTIONS: late-month txs that belong to next month
      for (const tx of lateMonthTxs) {
        for (const rule of nextMonthRules) {
          const due = getExpectedDueDate(
            rule,
            nextY,
            nextM,
            bestDueDayByRule.get(rule.id)
          );
          if (txMatchesRule(tx, rule, due)) {
            adj(tx.categoryId ?? rule.categoryId, -Math.abs(tx.amount));
            break;
          }
        }
      }

      // 3. SUBTRACTIONS: early-month txs that belong to prev month
      for (const tx of earlyMonthTxs) {
        for (const rule of prevMonthRules) {
          const due = getExpectedDueDate(
            rule,
            prevY,
            prevM,
            bestDueDayByRule.get(rule.id)
          );
          if (txMatchesRule(tx, rule, due)) {
            adj(tx.categoryId ?? rule.categoryId, -Math.abs(tx.amount));
            break;
          }
        }
      }

      // Apply adjustments to spendingMap
      for (const [catId, delta] of categoryAdj) {
        const key = catId as string;
        const current = spendingMap.get(key) ?? 0;
        spendingMap.set(key, Math.max(0, current + delta));
      }

      // Recompute total from adjusted spending
      let totalActualExpenses = 0;
      for (const value of spendingMap.values()) {
        totalActualExpenses += value;
      }

      if (!tracker) {
        // No tracker yet — still return actual spending + income data
        const allCategoryIds = [
          ...new Set([...spendingMap.keys(), ...incomeMap.keys()]),
        ].filter((id): id is string => id !== null && id !== (null as unknown as string));

        const allCategories = allCategoryIds.length > 0
          ? await ctx.prisma.category.findMany({
              where: { id: { in: allCategoryIds } },
              select: { id: true, name: true, icon: true, color: true },
            })
          : [];

        const categoryMap = new Map(allCategories.map((c) => [c.id, c]));

        const categories: {
          categoryId: string | null;
          category: { id: string; name: string; icon: string | null; color: string | null } | null;
          allocated: number;
          spent: number;
          remaining: number;
          incomeActual: number;
          expenseActual: number;
        }[] = [];

        const addedIds = new Set<string | null>();

        for (const [catId, expenseActual] of spendingMap) {
          if (expenseActual <= 0) continue;
          const id = catId as string | null;
          addedIds.add(id);
          categories.push({
            categoryId: id,
            category: id ? categoryMap.get(id) ?? null : null,
            allocated: 0,
            spent: expenseActual,
            remaining: -expenseActual,
            incomeActual: 0,
            expenseActual,
          });
        }

        // Add income categories not already added
        for (const [catId, incomeActual] of incomeMap) {
          if (incomeActual <= 0) continue;
          const id = catId as string | null;
          if (addedIds.has(id)) continue;
          categories.push({
            categoryId: id,
            category: id ? categoryMap.get(id) ?? null : null,
            allocated: 0,
            spent: incomeActual,
            remaining: -incomeActual,
            incomeActual,
            expenseActual: 0,
          });
        }

        return {
          totalIncome: 0,
          actualIncome,
          totalAllocated: 0,
          totalActualExpenses,
          unallocated: 0,
          categories,
        };
      }

      const totalAllocated = tracker.allocations.reduce(
        (sum, a) => sum + a.amount,
        0
      );

      // Build categories: start with allocations, then add any category
      // that has spending but no allocation
      const allocatedCategoryIds = new Set(
        tracker.allocations.map((a) => a.categoryId)
      );

      const categories = tracker.allocations.map((alloc) => {
        const incomeActual = incomeMap.get(alloc.categoryId) ?? 0;
        const expenseActual = spendingMap.get(alloc.categoryId) ?? 0;
        const spent = expenseActual > 0 ? expenseActual : incomeActual;
        return {
          categoryId: alloc.categoryId,
          category: alloc.category,
          allocated: alloc.amount,
          spent,
          remaining: alloc.amount - spent,
          incomeActual,
          expenseActual,
        };
      });

      // Add unallocated categories that have spending or income
      const allActualCategoryIds = new Set([...spendingMap.keys(), ...incomeMap.keys()]);
      const unallocatedCategoryIds = [...allActualCategoryIds].filter(
        (id) => id !== null && !allocatedCategoryIds.has(id)
      );

      if (unallocatedCategoryIds.length > 0) {
        const extraCategories = await ctx.prisma.category.findMany({
          where: { id: { in: unallocatedCategoryIds as string[] } },
          select: { id: true, name: true, icon: true, color: true },
        });

        for (const cat of extraCategories) {
          const incomeActual = incomeMap.get(cat.id) ?? 0;
          const expenseActual = spendingMap.get(cat.id) ?? 0;
          const spent = expenseActual > 0 ? expenseActual : incomeActual;
          categories.push({
            categoryId: cat.id,
            category: cat,
            allocated: 0,
            spent,
            remaining: -spent,
            incomeActual,
            expenseActual,
          });
        }
      }

      // Also include uncategorized spending (categoryId = null)
      const uncategorizedSpent = spendingMap.get(null as unknown as string) ?? 0;
      if (uncategorizedSpent > 0) {
        categories.push({
          categoryId: null as unknown as string,
          category: null as unknown as typeof categories[0]["category"],
          allocated: 0,
          spent: uncategorizedSpent,
          remaining: -uncategorizedSpent,
          incomeActual: 0,
          expenseActual: uncategorizedSpent,
        });
      }

      return {
        totalIncome: tracker.totalIncome,
        actualIncome,
        totalAllocated,
        totalActualExpenses,
        unallocated: tracker.totalIncome - totalAllocated,
        categories,
      };
    }),

  setTagAllocation: householdProcedure
    .input(
      z.object({
        trackerId: z.string(),
        tagId: z.string(),
        amount: z.number().int().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.tagTrackerAllocation.upsert({
        where: {
          trackerId_tagId: {
            trackerId: input.trackerId,
            tagId: input.tagId,
          },
        },
        update: { amount: input.amount },
        create: {
          trackerId: input.trackerId,
          tagId: input.tagId,
          amount: input.amount,
        },
      });
    }),

  getTagSummary: householdProcedure
    .input(
      z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2020).max(2100),
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .query(async ({ ctx, input }) => {
      const tracker = await ctx.prisma.tracker.findUnique({
        where: {
          householdId_userId_month_year_visibility: {
            householdId: ctx.householdId,
            userId: ctx.userId,
            month: input.month,
            year: input.year,
            visibility: input.visibility,
          },
        },
        include: {
          tagAllocations: {
            include: {
              tag: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                  groupId: true,
                  isArchived: true,
                  group: { select: { id: true, name: true, color: true } },
                },
              },
            },
          },
        },
      });

      const { start, end } = getMonthRange(input.year, input.month);

      const visibilityFilter =
        input.visibility === "SHARED"
          ? visibleTransactionsWhere(ctx.userId, ctx.householdId)
          : { userId: ctx.userId, visibility: "PERSONAL" as const };

      // Fetch expense transactions with tags for this month (liquid accounts only)
      const transactionsWithTags = await ctx.prisma.transaction.findMany({
        where: {
          ...visibilityFilter,
          account: { type: { in: LIQUID_ACCOUNT_TYPES } },
          date: { gte: start, lte: end },
          type: "EXPENSE",
          tags: { some: {} },
        },
        select: {
          amount: true,
          tags: { select: { tagId: true } },
        },
      });

      // Aggregate spending per tag (a transaction counts toward each of its tags)
      const spendingMap = new Map<string, number>();
      for (const tx of transactionsWithTags) {
        const absAmount = Math.abs(tx.amount);
        for (const tt of tx.tags) {
          spendingMap.set(tt.tagId, (spendingMap.get(tt.tagId) ?? 0) + absAmount);
        }
      }

      // Build allocation map
      const allocationMap = new Map<string, number>();
      const tagInfoMap = new Map<
        string,
        { id: string; name: string; color: string | null; groupId: string | null; group: { id: string; name: string; color: string | null } | null }
      >();

      if (tracker) {
        for (const alloc of tracker.tagAllocations) {
          if (!alloc.tag.isArchived) {
            allocationMap.set(alloc.tagId, alloc.amount);
            tagInfoMap.set(alloc.tag.id, alloc.tag);
          }
        }
      }

      // Merge: tags with allocations OR spending
      const allTagIds = new Set([...allocationMap.keys(), ...spendingMap.keys()]);

      // Fetch info for tags that have spending but no allocation
      const missingTagIds = [...allTagIds].filter((id) => !tagInfoMap.has(id));
      if (missingTagIds.length > 0) {
        const extraTags = await ctx.prisma.tag.findMany({
          where: { id: { in: missingTagIds }, isArchived: false },
          select: {
            id: true,
            name: true,
            color: true,
            groupId: true,
            group: { select: { id: true, name: true, color: true } },
          },
        });
        for (const t of extraTags) {
          tagInfoMap.set(t.id, t);
        }
      }

      const tags = [...allTagIds]
        .filter((id) => tagInfoMap.has(id))
        .map((tagId) => {
          const allocated = allocationMap.get(tagId) ?? 0;
          const spent = spendingMap.get(tagId) ?? 0;
          return {
            tagId,
            tag: tagInfoMap.get(tagId)!,
            allocated,
            spent,
            remaining: allocated - spent,
          };
        });

      return { tags };
    }),

  copyPreviousMonth: householdProcedure
    .input(
      z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2020).max(2100),
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const prev = getPreviousMonth(input.year, input.month);

      // Find previous month's tracker
      const prevTracker = await ctx.prisma.tracker.findUnique({
        where: {
          householdId_userId_month_year_visibility: {
            householdId: ctx.householdId,
            userId: ctx.userId,
            month: prev.month,
            year: prev.year,
            visibility: input.visibility,
          },
        },
        include: { allocations: true, tagAllocations: true },
      });

      if (!prevTracker) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No tracker found for the previous month.",
        });
      }

      // Find or create the current month's tracker
      let currentTracker = await ctx.prisma.tracker.findUnique({
        where: {
          householdId_userId_month_year_visibility: {
            householdId: ctx.householdId,
            userId: ctx.userId,
            month: input.month,
            year: input.year,
            visibility: input.visibility,
          },
        },
      });

      if (!currentTracker) {
        currentTracker = await ctx.prisma.tracker.create({
          data: {
            month: input.month,
            year: input.year,
            visibility: input.visibility,
            householdId: ctx.householdId,
            userId: ctx.userId,
          },
        });
      }

      // Copy allocations (income is now managed via category allocations)
      if (prevTracker.allocations.length > 0) {
        await ctx.prisma.$transaction(
          prevTracker.allocations.map((alloc) =>
            ctx.prisma.trackerAllocation.upsert({
              where: {
                trackerId_categoryId: {
                  trackerId: currentTracker.id,
                  categoryId: alloc.categoryId,
                },
              },
              update: { amount: alloc.amount },
              create: {
                trackerId: currentTracker.id,
                categoryId: alloc.categoryId,
                amount: alloc.amount,
              },
            })
          )
        );
      }

      // Copy tag allocations
      if (prevTracker.tagAllocations.length > 0) {
        await ctx.prisma.$transaction(
          prevTracker.tagAllocations.map((alloc) =>
            ctx.prisma.tagTrackerAllocation.upsert({
              where: {
                trackerId_tagId: {
                  trackerId: currentTracker.id,
                  tagId: alloc.tagId,
                },
              },
              update: { amount: alloc.amount },
              create: {
                trackerId: currentTracker.id,
                tagId: alloc.tagId,
                amount: alloc.amount,
              },
            })
          )
        );
      }

      // Return updated tracker
      return ctx.prisma.tracker.findUnique({
        where: { id: currentTracker.id },
        include: {
          allocations: {
            include: {
              category: { select: { id: true, name: true, icon: true, color: true } },
            },
            orderBy: { category: { sortOrder: "asc" } },
          },
        },
      });
    }),
});
