import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";
import { visibleTransactionsWhere, transactionOwnershipFilter } from "@/lib/privacy";
import { getMonthRange, getPreviousMonth } from "@/lib/date";
import { SPENDING_ACCOUNT_TYPES, INVESTMENT_ACCOUNT_TYPES } from "@/lib/account-types";

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
              category: { select: { id: true, name: true, icon: true, color: true, type: true } },
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
                category: { select: { id: true, name: true, icon: true, color: true, type: true } },
              },
            },
          },
        });
      }

      return tracker;
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
              category: { select: { id: true, name: true, icon: true, color: true, type: true } },
            },
          },
        },
      });

      const { start, end } = getMonthRange(input.year, input.month);

      // Visibility filter for transactions — derived from account ownership
      const visibilityFilter = transactionOwnershipFilter(
        ctx.userId, ctx.householdId, input.visibility
      );

      // Only consider spending account transactions for budgeting
      const liquidFilter = { account: { type: { in: SPENDING_ACCOUNT_TYPES } } };

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
            { type: { in: ["INCOME", "EXPENSE", "INVESTMENT"] } },
            { isInitialBalance: false },
          ],
        },
        select: {
          id: true,
          amount: true,
          type: true,
          categoryId: true,
          opheliaCategoryId: true,
          effectiveCategoryId: true,
        },
      });

      const incomeCategoryIdSet = new Set(incomeCategoryIds);
      const expenseCategoryIdSet = new Set(expenseCategoryIds);

      // Build category actual maps and aggregate totals by transaction type
      const categoryActualMap = new Map<string | null, number>();
      let actualIncome = 0;
      let actualInvestment = 0;
      let totalActualExpenses = 0;

      for (const tx of allMonthTxs) {
        const effectiveCatId = tx.effectiveCategoryId;
        categoryActualMap.set(effectiveCatId, (categoryActualMap.get(effectiveCatId) ?? 0) + tx.amount);

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

      // Per-account investment breakdown for the tracker UI
      const investmentByAccount = await ctx.prisma.transaction.groupBy({
        by: ["accountId"],
        where: {
          AND: [
            visibilityFilter,
            effectiveDateFilter(start, end),
            { account: { type: { in: INVESTMENT_ACCOUNT_TYPES } } },
            { type: { not: "TRANSFER" } },
            { isInitialBalance: false },
          ],
        },
        _sum: { amount: true },
      });

      const investmentActualByAccount = new Map(
        investmentByAccount.map(g => [g.accountId, g._sum.amount ?? 0])
      );

      // Fetch investment allocations (per-account budgets) from tracker
      const investmentAllocations = tracker
        ? await ctx.prisma.investmentTrackerAllocation.findMany({
            where: { trackerId: tracker.id },
            include: { account: { select: { id: true, name: true, icon: true, type: true } } },
          })
        : [];

      const investmentBudgeted = investmentAllocations.reduce((sum, a) => sum + a.amount, 0);

      // Fetch active investment accounts scoped by ownership context
      const allInvestmentAccounts = await ctx.prisma.financialAccount.findMany({
        where: {
          type: { in: INVESTMENT_ACCOUNT_TYPES },
          isActive: true,
          ownership: input.visibility,
          ...(input.visibility === "SHARED"
            ? { householdId: ctx.householdId }
            : { ownerId: ctx.userId }),
        },
        select: { id: true, name: true, icon: true, type: true },
      });

      // Merge allocations + actuals + all accounts
      const allInvestmentAccountIds = new Set([
        ...allInvestmentAccounts.map(a => a.id),
        ...investmentAllocations.map(a => a.accountId),
        ...investmentByAccount.map(g => g.accountId),
      ]);

      const allAccountMap = new Map(allInvestmentAccounts.map(a => [a.id, a]));

      const investmentSummary = [...allInvestmentAccountIds].map(accountId => {
        const allocation = investmentAllocations.find(a => a.accountId === accountId);
        const account = allocation?.account ?? allAccountMap.get(accountId);
        return {
          accountId,
          accountName: account?.name ?? "Unknown",
          accountIcon: account?.icon ?? null,
          budgeted: allocation?.amount ?? 0,
          actual: investmentActualByAccount.get(accountId) ?? 0,
        };
      }).sort((a, b) => a.budgeted - b.budgeted);

      // spendingMap / incomeMap: per-category breakdown for the UI
      const spendingMap = new Map<string | null, number>();
      const incomeMap = new Map<string | null, number>();

      for (const [catId, amount] of categoryActualMap) {
        if (catId && incomeCategoryIdSet.has(catId)) {
          incomeMap.set(catId, amount);
        } else {
          spendingMap.set(catId, Math.abs(amount));
        }
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
          actualIncome,
          actualInvestment,
          investmentBudgeted,
          totalAllocated: 0,
          totalActualExpenses,
          categories,
          investmentSummary,
          carryIn: 0,
          toNextMonth: null as number | null,
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
          select: { id: true, name: true, icon: true, color: true, type: true },
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

      // Compute carry-in (always auto from previous month's toNextMonth)
      const carryIn = await computeAutoCarryForward(
        ctx.prisma, ctx.householdId, ctx.userId, input.visibility, input.year, input.month
      );

      // Compute and persist "to next month"
      // Formula: carryIn + actualIncome + actualInvestment - actualExpenses - fundAllocations
      const fundAllocated = await ctx.prisma.fundTrackerAllocation.aggregate({
        where: { trackerId: tracker.id },
        _sum: { amount: true },
      }).then((r) => r._sum.amount ?? 0);

      const toNextMonth = carryIn + actualIncome + actualInvestment - totalActualExpenses - fundAllocated;

      // Persist toNextMonth
      await ctx.prisma.tracker.update({
        where: { id: tracker.id },
        data: { toNextMonth },
      });

      return {
        actualIncome,
        actualInvestment,
        investmentBudgeted,
        totalAllocated,
        totalActualExpenses,
        categories,
        investmentSummary,
        carryIn,
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

  setInvestmentAllocation: householdProcedure
    .input(
      z.object({
        trackerId: z.string(),
        accountId: z.string(),
        amount: z.number().int(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.investmentTrackerAllocation.upsert({
        where: {
          trackerId_accountId: {
            trackerId: input.trackerId,
            accountId: input.accountId,
          },
        },
        update: { amount: input.amount },
        create: {
          trackerId: input.trackerId,
          accountId: input.accountId,
          amount: input.amount,
        },
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

      const visibilityFilter = transactionOwnershipFilter(
        ctx.userId, ctx.householdId, input.visibility
      );

      // Fetch expense transactions with tags for this month (spending accounts only)
      const transactionsWithTags = await ctx.prisma.transaction.findMany({
        where: {
          ...visibilityFilter,
          account: { type: { in: SPENDING_ACCOUNT_TYPES } },
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

      // Copy investment allocations
      const prevInvestmentAllocations =
        await ctx.prisma.investmentTrackerAllocation.findMany({
          where: { trackerId: prevTracker.id },
        });

      if (prevInvestmentAllocations.length > 0) {
        await ctx.prisma.$transaction(
          prevInvestmentAllocations.map((alloc) =>
            ctx.prisma.investmentTrackerAllocation.upsert({
              where: {
                trackerId_accountId: {
                  trackerId: currentTracker.id,
                  accountId: alloc.accountId,
                },
              },
              update: { amount: alloc.amount },
              create: {
                trackerId: currentTracker.id,
                accountId: alloc.accountId,
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
              category: { select: { id: true, name: true, icon: true, color: true, type: true } },
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

      return { reset: catDeleted.count + fundDeleted.count + tagDeleted.count };
    }),
});
