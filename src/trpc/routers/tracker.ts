import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";
import { visibleTransactionsWhere } from "@/lib/privacy";
import { getMonthRange, getPreviousMonth } from "@/lib/date";
import { LIQUID_ACCOUNT_TYPES } from "@/lib/account-types";

/**
 * Get the auto carry-forward from the previous month.
 * Simply reads the previous month's persisted `toNextMonth` value.
 */
async function computeAutoCarryForward(
  prisma: any,
  householdId: string,
  userId: string,
  visibility: "SHARED" | "PERSONAL",
  year: number,
  month: number,
): Promise<number> {
  const prev = getPreviousMonth(year, month);

  const prevTracker = await prisma.tracker.findUnique({
    where: {
      householdId_userId_month_year_visibility: {
        householdId,
        userId,
        month: prev.month,
        year: prev.year,
        visibility,
      },
    },
    select: { id: true, toNextMonth: true },
  });

  if (!prevTracker) return 0;

  // If toNextMonth is already persisted, use it directly
  if (prevTracker.toNextMonth !== null) return prevTracker.toNextMonth;

  // Otherwise, return 0 — it will be computed and persisted when the user visits that month
  return 0;
}

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
      const validCategoryIds = new Set(leafCategories.map((c) => c.id));

      // Get ALL transactions for this month with both categoryId and opheliaCategoryId
      // so we can use Ophelia's suggestion as fallback for uncategorized transactions
      const allMonthTxs = await ctx.prisma.transaction.findMany({
        where: {
          AND: [
            visibilityFilter,
            liquidFilter,
            effectiveDateFilter(start, end),
            { type: { not: "TRANSFER" } },
            { isInitialBalance: false },
          ],
        },
        select: {
          id: true,
          amount: true,
          categoryId: true,
          opheliaCategoryId: true,
          effectiveCategoryId: true,
          fundId: true,
        },
      });

      const incomeCategoryIdSet = new Set(incomeCategoryIds);
      const expenseCategoryIdSet = new Set(expenseCategoryIds);

      // Build unified actual map using effectiveCategoryId column
      // Fund transactions are excluded (tracked separately in fund table)
      const categoryActualMap = new Map<string | null, number>();
      let actualIncome = 0;

      for (const tx of allMonthTxs) {
        if (tx.fundId) continue; // fund transactions tracked separately

        const effectiveCatId = tx.effectiveCategoryId;

        categoryActualMap.set(effectiveCatId, (categoryActualMap.get(effectiveCatId) ?? 0) + tx.amount);

        if (effectiveCatId && incomeCategoryIdSet.has(effectiveCatId)) {
          actualIncome += tx.amount; // net income (positive income - deductions)
        }
      }

      // spendingMap: for expense categories, store absolute spending; for income categories, store raw amount
      // This preserves backward compatibility with the boundary adjustment logic and category building
      const spendingMap = new Map<string | null, number>();
      const incomeMap = new Map<string | null, number>();

      for (const [catId, amount] of categoryActualMap) {
        if (catId && incomeCategoryIdSet.has(catId)) {
          // Income: keep raw amount (positive = received, negative = deductions/corrections)
          incomeMap.set(catId, amount);
        } else {
          // Expense categories and uncategorized — store as positive (abs)
          spendingMap.set(catId, Math.abs(amount));
        }
      }

      // Compute total from spending
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
          if (incomeActual === 0) continue;
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
          carryForward: 0,
          carryForwardIsManual: false,
          autoCarryForward: 0,
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

      // Compute carry-forward
      const autoCarryForward = await computeAutoCarryForward(
        ctx.prisma, ctx.householdId, ctx.userId, input.visibility, input.year, input.month
      );
      const effectiveCarryForward = tracker.carryForward ?? autoCarryForward;

      // Compute and persist "to next month"
      // Same formula as frontend: readyToAssign + incomeAvailable + expenseAvailable
      const incomeAllocated = tracker.allocations
        .filter((a) => incomeCategoryIdSet.has(a.categoryId))
        .reduce((sum, a) => sum + a.amount, 0);
      const expenseAllocated = tracker.allocations
        .filter((a) => expenseCategoryIdSet.has(a.categoryId))
        .reduce((sum, a) => sum + a.amount, 0);
      const fundAllocated = await ctx.prisma.fundTrackerAllocation.aggregate({
        where: { trackerId: tracker.id },
        _sum: { amount: true },
      }).then((r) => r._sum.amount ?? 0);

      const readyToAssign = effectiveCarryForward + incomeAllocated - expenseAllocated - fundAllocated;
      const incomeAvail = actualIncome - incomeAllocated;
      const expenseAvail = expenseAllocated - totalActualExpenses;
      const toNextMonth = readyToAssign + incomeAvail + expenseAvail;

      // Persist toNextMonth
      await ctx.prisma.tracker.update({
        where: { id: tracker.id },
        data: { toNextMonth },
      });

      return {
        totalIncome: tracker.totalIncome,
        actualIncome,
        totalAllocated,
        totalActualExpenses,
        unallocated: tracker.totalIncome - totalAllocated,
        categories,
        carryForward: effectiveCarryForward,
        carryForwardIsManual: tracker.carryForward !== null,
        autoCarryForward,
        toNextMonth,
      };
    }),

  setFundAllocation: householdProcedure
    .input(
      z.object({
        trackerId: z.string(),
        fundId: z.string(),
        amount: z.number().int(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.fundTrackerAllocation.upsert({
        where: {
          trackerId_fundId: {
            trackerId: input.trackerId,
            fundId: input.fundId,
          },
        },
        update: { amount: input.amount },
        create: {
          trackerId: input.trackerId,
          fundId: input.fundId,
          amount: input.amount,
        },
      });
    }),

  setCarryForward: householdProcedure
    .input(
      z.object({
        trackerId: z.string(),
        amount: z.number().int().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.tracker.update({
        where: { id: input.trackerId },
        data: { carryForward: input.amount },
      });
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

      // Copy fund allocations
      const prevFundAllocations =
        await ctx.prisma.fundTrackerAllocation.findMany({
          where: { trackerId: prevTracker.id },
        });

      if (prevFundAllocations.length > 0) {
        await ctx.prisma.$transaction(
          prevFundAllocations.map((alloc) =>
            ctx.prisma.fundTrackerAllocation.upsert({
              where: {
                trackerId_fundId: {
                  trackerId: currentTracker.id,
                  fundId: alloc.fundId,
                },
              },
              update: { amount: alloc.amount },
              create: {
                trackerId: currentTracker.id,
                fundId: alloc.fundId,
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

  resetAllocations: householdProcedure
    .input(
      z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2020).max(2100),
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .mutation(async ({ ctx, input }) => {
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
      });

      if (!tracker) return { reset: 0 };

      const [catDeleted, fundDeleted, tagDeleted] = await ctx.prisma.$transaction([
        ctx.prisma.trackerAllocation.deleteMany({
          where: { trackerId: tracker.id },
        }),
        ctx.prisma.fundTrackerAllocation.deleteMany({
          where: { trackerId: tracker.id },
        }),
        ctx.prisma.tagTrackerAllocation.deleteMany({
          where: { trackerId: tracker.id },
        }),
      ]);

      // Also clear carry-forward override
      await ctx.prisma.tracker.update({
        where: { id: tracker.id },
        data: { carryForward: null },
      });

      return { reset: catDeleted.count + fundDeleted.count + tagDeleted.count };
    }),
});
