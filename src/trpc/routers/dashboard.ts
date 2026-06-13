import { z } from "zod/v4";
import { router, householdProcedure } from "../init";
import { visibleTransactionsWhere, visibleAccountsWhere } from "@/lib/privacy";
import { dashboardTransactionsWhere } from "@/lib/dashboard-where";
import { getMonthRange } from "@/lib/date";
import { SPENDING_ACCOUNT_TYPES } from "@/lib/account-types";

export const dashboardRouter = router({
  /** Completion signals for the getting-started checklist */
  onboardingStatus: householdProcedure.query(async ({ ctx }) => {
    const accountsWhere = visibleAccountsWhere(ctx.userId, ctx.householdId);
    const [accountCount, importCount, categorizedCount] = await Promise.all([
      ctx.prisma.financialAccount.count({ where: accountsWhere }),
      ctx.prisma.importBatch.count({
        where: { status: "COMPLETED", account: accountsWhere },
      }),
      ctx.prisma.transaction.count({
        where: {
          AND: [
            visibleTransactionsWhere(ctx.userId, ctx.householdId),
            { categoryId: { not: null } },
          ],
        },
        take: 1,
      }),
    ]);
    return {
      hasAccounts: accountCount > 0,
      hasImports: importCount > 0,
      hasCategorized: categorizedCount > 0,
    };
  }),

  monthlySummary: householdProcedure
    .input(
      z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2020).max(2100),
        budgetScope: z.enum(["SHARED", "PERSONAL"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { start, end } = getMonthRange(input.year, input.month);

      const baseWhere = dashboardTransactionsWhere({
        userId: ctx.userId,
        householdId: ctx.householdId,
        budgetScope: input.budgetScope,
        dateRange: { gte: start, lte: end },
        includeInitialBalance: true, // preserve original behavior
      });

      // Income total
      const income = await ctx.prisma.transaction.aggregate({
        where: { AND: [baseWhere, { type: "INCOME" }] },
        _sum: { amount: true },
      });

      // Expense total
      const expenses = await ctx.prisma.transaction.aggregate({
        where: { AND: [baseWhere, { type: "EXPENSE" }] },
        _sum: { amount: true },
      });

      // Investment total
      const investment = await ctx.prisma.transaction.aggregate({
        where: { AND: [baseWhere, { type: "INVESTMENT" }] },
        _sum: { amount: true },
      });

      // By category
      const byCategory = await ctx.prisma.transaction.groupBy({
        by: ["categoryId"],
        where: { AND: [baseWhere, { type: "EXPENSE" }] },
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: "asc" } },
      });

      // Get category details
      const categoryIds = byCategory
        .map((c) => c.categoryId)
        .filter((id): id is string => id !== null);

      const categories = await ctx.prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true, icon: true, color: true },
      });

      const categoryMap = new Map(categories.map((c) => [c.id, c]));

      return {
        totalIncome: income._sum.amount ?? 0,
        totalExpenses: Math.abs(expenses._sum.amount ?? 0),
        totalInvestment: investment._sum.amount ?? 0,
        netFlow: (income._sum.amount ?? 0) + (expenses._sum.amount ?? 0) + (investment._sum.amount ?? 0),
        byCategory: byCategory.map((c) => ({
          category: c.categoryId ? categoryMap.get(c.categoryId) : null,
          amount: Math.abs(c._sum.amount ?? 0),
          count: c._count,
        })),
      };
    }),

  accountBalances: householdProcedure
    .input(
      z.object({
        budgetScope: z.enum(["SHARED", "PERSONAL"]).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.financialAccount.findMany({
        where: {
          ...visibleAccountsWhere(ctx.userId, ctx.householdId),
          ...(input?.budgetScope && { ownership: input.budgetScope }),
        },
        select: {
          id: true,
          name: true,
          type: true,
          ownership: true,
          currency: true,
          balance: true,
          institution: true,
          icon: true,
          color: true,
        },
        orderBy: [{ type: "asc" }, { name: "asc" }],
      });
    }),

  recentTransactions: householdProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(20).default(10),
        budgetScope: z.enum(["SHARED", "PERSONAL"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.transaction.findMany({
        where: dashboardTransactionsWhere({
          userId: ctx.userId,
          householdId: ctx.householdId,
          budgetScope: input.budgetScope,
          includeInitialBalance: true, // preserve original behavior
        }),
        orderBy: { date: "desc" },
        take: input.limit,
        include: {
          account: { select: { id: true, name: true, type: true } },
          category: { select: { id: true, name: true, icon: true, color: true } },
          tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
        },
      });
    }),

  /** Comprehensive monthly review with optional period comparison */
  monthlyReview: householdProcedure
    .input(z.object({
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      compareYear: z.number().int().optional(),
      compareMonth: z.number().int().min(1).max(12).optional(),
      budgetScope: z.enum(["SHARED", "PERSONAL"]),
    }))
    .query(async ({ ctx, input }) => {
      async function getMonthData(year: number, month: number) {
        const { start, end } = getMonthRange(year, month);
        const baseWhere = dashboardTransactionsWhere({
          userId: ctx.userId,
          householdId: ctx.householdId,
          budgetScope: input.budgetScope,
          dateRange: { gte: start, lte: end },
          type: { in: ["INCOME", "EXPENSE"] },
        });

        const txns = await ctx.prisma.transaction.findMany({
          where: baseWhere,
          select: {
            id: true, amount: true, type: true, description: true, displayName: true,
            category: { select: { id: true, name: true, icon: true, parent: { select: { name: true } } } },
          },
        });

        const totalIncome = txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
        const totalExpenses = txns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
        const netFlow = totalIncome + totalExpenses;
        const savingsRate = totalIncome > 0 ? (netFlow / totalIncome) * 100 : 0;

        // By category
        const catMap = new Map<string, { categoryId: string | null; categoryName: string | null; categoryIcon: string | null; parentName: string | null; amount: number; count: number }>();
        for (const t of txns) {
          if (t.amount >= 0) continue; // expenses only
          const key = t.category?.id ?? "__none__";
          const entry = catMap.get(key) ?? {
            categoryId: t.category?.id ?? null, categoryName: t.category?.name ?? null,
            categoryIcon: t.category?.icon ?? null, parentName: t.category?.parent?.name ?? null,
            amount: 0, count: 0,
          };
          entry.amount += t.amount;
          entry.count++;
          catMap.set(key, entry);
        }

        // Top merchants
        const merchantMap = new Map<string, { name: string; amount: number; count: number }>();
        for (const t of txns) {
          if (t.amount >= 0) continue;
          const name = t.displayName || t.description;
          const entry = merchantMap.get(name) ?? { name, amount: 0, count: 0 };
          entry.amount += t.amount;
          entry.count++;
          merchantMap.set(name, entry);
        }

        return {
          year, month,
          totalIncome, totalExpenses, netFlow, savingsRate,
          byCategory: Array.from(catMap.values()).sort((a, b) => a.amount - b.amount),
          topMerchants: Array.from(merchantMap.values()).sort((a, b) => a.amount - b.amount).slice(0, 10),
          transactionCount: txns.length,
        };
      }

      const current = await getMonthData(input.year, input.month);
      const compare = (input.compareYear && input.compareMonth)
        ? await getMonthData(input.compareYear, input.compareMonth)
        : null;

      // Deltas
      const deltas = compare ? (() => {
        const incomeChange = current.totalIncome - compare.totalIncome;
        // totalExpenses is a negative sum — compare magnitudes so that
        // positive = spending increased (UI inverts color accordingly).
        const expensesChange = Math.abs(current.totalExpenses) - Math.abs(compare.totalExpenses);
        const catChanges = new Map<string, { categoryId: string | null; categoryName: string | null; categoryIcon: string | null; currentAmount: number; compareAmount: number }>();

        for (const c of current.byCategory) {
          catChanges.set(c.categoryId ?? "__none__", { categoryId: c.categoryId, categoryName: c.categoryName, categoryIcon: c.categoryIcon, currentAmount: c.amount, compareAmount: 0 });
        }
        for (const c of compare.byCategory) {
          const key = c.categoryId ?? "__none__";
          const entry = catChanges.get(key) ?? { categoryId: c.categoryId, categoryName: c.categoryName, categoryIcon: c.categoryIcon, currentAmount: 0, compareAmount: 0 };
          entry.compareAmount = c.amount;
          catChanges.set(key, entry);
        }

        return {
          incomeChange,
          incomeChangePercent: compare.totalIncome !== 0 ? (incomeChange / Math.abs(compare.totalIncome)) * 100 : 0,
          expensesChange,
          expensesChangePercent: compare.totalExpenses !== 0 ? (expensesChange / Math.abs(compare.totalExpenses)) * 100 : 0,
          netFlowChange: current.netFlow - compare.netFlow,
          savingsRateChange: current.savingsRate - compare.savingsRate,
          categoryChanges: Array.from(catChanges.values())
            // Amounts are negative sums — compare magnitudes (positive change = spent more)
            .map((c) => {
              const change = Math.abs(c.currentAmount) - Math.abs(c.compareAmount);
              return { ...c, change, changePercent: c.compareAmount !== 0 ? (change / Math.abs(c.compareAmount)) * 100 : 0 };
            })
            .sort((a, b) => b.change - a.change),
        };
      })() : null;

      // ── 12-month windows (trend, expense breakdown, fund history) ──────
      // These were three sequential per-month loops (~60 round-trips). They
      // are now a handful of batched queries with the bucketing done in JS —
      // the result shapes are unchanged.
      const months: Array<{ year: number; month: number; label: string; key: string }> = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(input.year, input.month - 1 - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        months.push({
          year: y, month: m,
          label: d.toLocaleDateString("en-GB", { month: "short" }),
          key: `${y}-${m}`,
        });
      }
      const monthKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}`;
      const monthIndex = (year: number, month: number) => year * 12 + (month - 1);
      const windowStart = getMonthRange(months[0].year, months[0].month).start;
      const windowEnd = getMonthRange(months[11].year, months[11].month).end;

      // One fetch covers both the trend (INCOME+EXPENSE sums) and the expense
      // breakdown (EXPENSE rows grouped by parent category).
      const windowTxns = await ctx.prisma.transaction.findMany({
        where: dashboardTransactionsWhere({
          userId: ctx.userId,
          householdId: ctx.householdId,
          budgetScope: input.budgetScope,
          dateRange: { gte: windowStart, lte: windowEnd },
          type: { in: ["INCOME", "EXPENSE"] },
        }),
        select: {
          date: true,
          amount: true,
          type: true,
          category: { select: { parent: { select: { id: true, name: true } } } },
        },
      });

      // All fund allocations + spending up to the window end — used for the
      // per-month trend budget and the cumulative fund-balance history.
      const fundCategoryFilter = {
        householdId: ctx.householdId,
        type: "FUND" as const,
        budgetScope: input.budgetScope,
        isArchived: false,
      };
      const allAllocations = await ctx.prisma.fundTrackerAllocation.findMany({
        where: {
          category: fundCategoryFilter,
          tracker: {
            OR: [
              { year: { lt: months[11].year } },
              { year: months[11].year, month: { lte: months[11].month } },
            ],
          },
        },
        select: { amount: true, tracker: { select: { year: true, month: true } } },
      });
      const allFundSpending = await ctx.prisma.transaction.findMany({
        where: {
          AND: [
            dashboardTransactionsWhere({ userId: ctx.userId, householdId: ctx.householdId, type: "FUND" }),
            { category: fundCategoryFilter },
            { account: { type: { in: SPENDING_ACCOUNT_TYPES } } },
            {
              OR: [
                { accrualDate: { lte: windowEnd } },
                { accrualDate: null, date: { lte: windowEnd } },
              ],
            },
          ],
        },
        select: { amount: true, accrualDate: true, date: true },
      });

      // Trend + expense breakdown buckets
      const trendByKey = new Map<string, { income: number; expenses: number }>();
      const groupMapsByKey = new Map<string, Map<string, { groupId: string; groupName: string; amount: number }>>();
      const fundBudgetByKey = new Map<string, number>();
      for (const mo of months) {
        trendByKey.set(mo.key, { income: 0, expenses: 0 });
        groupMapsByKey.set(mo.key, new Map());
        fundBudgetByKey.set(mo.key, 0);
      }
      for (const tx of windowTxns) {
        const key = monthKey(tx.date);
        const bucket = trendByKey.get(key);
        if (!bucket) continue; // defensive: outside window
        if (tx.type === "INCOME") {
          bucket.income += tx.amount;
        } else if (tx.type === "EXPENSE") {
          bucket.expenses += tx.amount;
          const gm = groupMapsByKey.get(key)!;
          const groupId = tx.category?.parent?.id ?? "__uncategorized__";
          const groupName = tx.category?.parent?.name ?? "Uncategorized";
          const entry = gm.get(groupId) ?? { groupId, groupName, amount: 0 };
          entry.amount += Math.abs(tx.amount);
          gm.set(groupId, entry);
        }
      }
      for (const a of allAllocations) {
        const key = `${a.tracker.year}-${a.tracker.month}`;
        if (fundBudgetByKey.has(key)) fundBudgetByKey.set(key, (fundBudgetByKey.get(key) ?? 0) + a.amount);
      }

      const trendMonths = months.map((mo) => {
        const t = trendByKey.get(mo.key)!;
        const net = t.income + t.expenses;
        return {
          year: mo.year, month: mo.month, label: mo.label,
          income: t.income,
          expenses: Math.abs(t.expenses),
          net,
          savingsRate: t.income > 0 ? (net / t.income) * 100 : 0,
          monthlyFundBudget: fundBudgetByKey.get(mo.key) ?? 0,
        };
      });

      const expensesByGroup = months.map((mo) => ({
        year: mo.year, month: mo.month, label: mo.label,
        groups: Array.from(groupMapsByKey.get(mo.key)!.values()).sort((a, b) => b.amount - a.amount),
      }));

      // Cumulative fund-balance history: allocations up to and including each
      // month, spending with effective date (accrualDate ?? date) <= month end.
      const allocByIndex = allAllocations.map((a) => ({ amount: a.amount, idx: monthIndex(a.tracker.year, a.tracker.month) }));
      const spendByEff = allFundSpending
        .map((s) => ({ amount: s.amount, eff: s.accrualDate ?? s.date }))
        .sort((a, b) => a.eff.getTime() - b.eff.getTime());
      const fundHistory = months.map((mo) => {
        const idx = monthIndex(mo.year, mo.month);
        const monthEnd = getMonthRange(mo.year, mo.month).end;
        const totalBudgeted = allocByIndex.reduce((s, a) => (a.idx <= idx ? s + a.amount : s), 0);
        const spentSum = spendByEff.reduce((s, sp) => (sp.eff.getTime() <= monthEnd.getTime() ? s + sp.amount : s), 0);
        const totalSpent = -spentSum; // expenses are negative
        return {
          year: mo.year, month: mo.month, label: mo.label,
          totalAvailable: totalBudgeted - totalSpent,
        };
      });

      return { current, compare, deltas, trends: { months: trendMonths }, expensesByGroup, fundHistory };
    }),

  /** Fund summary for dashboard — simplified view of all funds */
  fundSummary: householdProcedure
    .input(z.object({
      month: z.number().int().min(1).max(12),
      year: z.number().int().min(2020).max(2100),
      budgetScope: z.enum(["SHARED", "PERSONAL"]),
    }))
    .query(async ({ ctx, input }) => {
      const categories = await ctx.prisma.category.findMany({
        where: {
          householdId: ctx.householdId,
          type: "FUND",
          budgetScope: input.budgetScope,
          isArchived: false,
        },
        include: {
          fundTrackerAllocations: true,
          fundEntries: {
            where: { type: "ADJUSTMENT" },
            select: { amount: true },
          },
          lineItems: {
            select: { period: true, amount: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      });

      const { start: monthStart, end: monthEnd } = getMonthRange(input.year, input.month);

      const thisMonthTracker = await ctx.prisma.tracker.findUnique({
        where: {
          householdId_userId_month_year_budgetScope: {
            householdId: ctx.householdId,
            userId: ctx.userId,
            month: input.month,
            year: input.year,
            budgetScope: input.budgetScope,
          },
        },
      });

      const allTrackerIds = [...new Set(categories.flatMap((c) => c.fundTrackerAllocations.map((a) => a.trackerId)))];
      const trackers = allTrackerIds.length > 0
        ? await ctx.prisma.tracker.findMany({
            where: { id: { in: allTrackerIds } },
            select: { id: true, month: true, year: true },
          })
        : [];
      const trackerDateMap = new Map(trackers.map((t) => [t.id, t]));

      const visibilityFilter = visibleTransactionsWhere(ctx.userId, ctx.householdId);
      const liquidFilter = { account: { type: { in: SPENDING_ACCOUNT_TYPES } } };

      let totalAvailable = 0;
      let totalBudgeted = 0;

      const fundResults = await Promise.all(
        categories.map(async (cat) => {
          const thisMonthBudget = thisMonthTracker
            ? cat.fundTrackerAllocations.find((a) => a.trackerId === thisMonthTracker.id)?.amount ?? 0
            : 0;

          let fundTotalBudgeted = 0;
          for (const alloc of cat.fundTrackerAllocations) {
            const t = trackerDateMap.get(alloc.trackerId);
            if (t && (t.year < input.year || (t.year === input.year && t.month <= input.month))) {
              fundTotalBudgeted += alloc.amount;
            }
          }

          const spendingAgg = await ctx.prisma.transaction.aggregate({
            where: {
              AND: [
                visibilityFilter,
                liquidFilter,
                { categoryId: cat.id, type: "FUND" },
                { isInitialBalance: false },
                {
                  OR: [
                    { accrualDate: { lte: monthEnd } },
                    { accrualDate: null, date: { lte: monthEnd } },
                  ],
                },
              ],
            },
            _sum: { amount: true },
          });
          const totalSpending = -(spendingAgg._sum?.amount ?? 0);

          const thisMonthAgg = await ctx.prisma.transaction.aggregate({
            where: {
              AND: [
                visibilityFilter,
                liquidFilter,
                { categoryId: cat.id, type: "FUND" },
                { isInitialBalance: false },
                {
                  OR: [
                    { accrualDate: { gte: monthStart, lte: monthEnd } },
                    { accrualDate: null, date: { gte: monthStart, lte: monthEnd } },
                  ],
                },
              ],
            },
            _sum: { amount: true },
          });
          const thisMonthActual = -(thisMonthAgg._sum?.amount ?? 0);

          const adjustments = cat.fundEntries.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0);

          const available = fundTotalBudgeted - totalSpending + adjustments;

          const target = cat.lineItems.length > 0
            ? cat.lineItems.reduce((s: number, li: { period: number; amount: number }) => s + li.period * li.amount, 0)
            : null;

          totalAvailable += available;
          totalBudgeted += thisMonthBudget;

          return {
            id: cat.id,
            name: cat.name,
            icon: cat.icon,
            target,
            available,
            thisMonthBudget,
            thisMonthActual,
          };
        })
      );

      return {
        funds: fundResults,
        totalAvailable,
        totalBudgeted,
      };
    }),
});
