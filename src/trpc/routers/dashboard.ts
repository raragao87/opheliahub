import { z } from "zod/v4";
import { router, householdProcedure } from "../init";
import { visibleTransactionsWhere, visibleAccountsWhere } from "@/lib/privacy";
import { getMonthRange } from "@/lib/date";
import { LIQUID_ACCOUNT_TYPES } from "@/lib/account-types";

export const dashboardRouter = router({
  monthlySummary: householdProcedure
    .input(
      z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2020).max(2100),
        visibility: z.enum(["SHARED", "PERSONAL"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { start, end } = getMonthRange(input.year, input.month);

      const baseWhere = {
        ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
        date: { gte: start, lte: end },
        ...(input.visibility && { visibility: input.visibility }),
      };

      // Income total
      const income = await ctx.prisma.transaction.aggregate({
        where: { ...baseWhere, type: "INCOME" },
        _sum: { amount: true },
      });

      // Expense total
      const expenses = await ctx.prisma.transaction.aggregate({
        where: { ...baseWhere, type: "EXPENSE" },
        _sum: { amount: true },
      });

      // By category
      const byCategory = await ctx.prisma.transaction.groupBy({
        by: ["categoryId"],
        where: { ...baseWhere, type: "EXPENSE" },
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
        netFlow: (income._sum.amount ?? 0) + (expenses._sum.amount ?? 0),
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
        visibility: z.enum(["SHARED", "PERSONAL"]).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.financialAccount.findMany({
        where: {
          ...visibleAccountsWhere(ctx.userId, ctx.householdId),
          ...(input?.visibility && { ownership: input.visibility }),
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
        visibility: z.enum(["SHARED", "PERSONAL"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.transaction.findMany({
        where: {
          ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
          ...(input.visibility && { visibility: input.visibility }),
        },
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
      visibility: z.enum(["SHARED", "PERSONAL"]),
    }))
    .query(async ({ ctx, input }) => {
      async function getMonthData(year: number, month: number) {
        const { start, end } = getMonthRange(year, month);
        const baseWhere = {
          ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
          visibility: input.visibility,
          date: { gte: start, lte: end },
          isInitialBalance: false,
          type: { in: ["INCOME", "EXPENSE"] as ("INCOME" | "EXPENSE")[] },
        };

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
        const expensesChange = current.totalExpenses - compare.totalExpenses;
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
            .map((c) => ({ ...c, change: c.currentAmount - c.compareAmount, changePercent: c.compareAmount !== 0 ? ((c.currentAmount - c.compareAmount) / Math.abs(c.compareAmount)) * 100 : 0 }))
            .sort((a, b) => a.change - b.change),
        };
      })() : null;

      // 12-month trend
      const trendMonths: Array<{
        year: number; month: number; label: string;
        income: number; expenses: number; net: number;
        savingsRate: number; monthlyFundBudget: number;
      }> = [];

      for (let i = 11; i >= 0; i--) {
        const d = new Date(input.year, input.month - 1 - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const { start, end } = getMonthRange(y, m);

        const agg = await ctx.prisma.transaction.groupBy({
          by: ["type"],
          where: {
            ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
            visibility: input.visibility,
            date: { gte: start, lte: end },
            isInitialBalance: false,
            type: { in: ["INCOME", "EXPENSE"] },
          },
          _sum: { amount: true },
        });

        const income = agg.find((a) => a.type === "INCOME")?._sum.amount ?? 0;
        const expenses = agg.find((a) => a.type === "EXPENSE")?._sum.amount ?? 0;
        const net = income + expenses;
        const savingsRate = income > 0 ? (net / income) * 100 : 0;

        // Per-month fund budget
        const monthFundBudget = await ctx.prisma.fundTrackerAllocation.aggregate({
          where: {
            fund: {
              householdId: ctx.householdId,
              userId: ctx.userId,
              visibility: input.visibility,
              isArchived: false,
            },
            tracker: { year: y, month: m },
          },
          _sum: { amount: true },
        });

        trendMonths.push({
          year: y, month: m,
          label: d.toLocaleDateString("en-GB", { month: "short" }),
          income,
          expenses: Math.abs(expenses),
          net,
          savingsRate,
          monthlyFundBudget: monthFundBudget._sum.amount ?? 0,
        });
      }

      // Expense breakdown by category group (parent category) over 12 months
      const expensesByGroup: Array<{
        year: number; month: number; label: string;
        groups: Array<{ groupId: string; groupName: string; amount: number }>;
      }> = [];

      for (let i = 11; i >= 0; i--) {
        const d = new Date(input.year, input.month - 1 - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const { start, end } = getMonthRange(y, m);

        const txns = await ctx.prisma.transaction.findMany({
          where: {
            ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
            visibility: input.visibility,
            date: { gte: start, lte: end },
            isInitialBalance: false,
            type: "EXPENSE",
          },
          select: {
            amount: true,
            category: {
              select: {
                parent: { select: { id: true, name: true } },
              },
            },
          },
        });

        const groupMap = new Map<string, { groupId: string; groupName: string; amount: number }>();
        for (const tx of txns) {
          const groupId = tx.category?.parent?.id ?? "__uncategorized__";
          const groupName = tx.category?.parent?.name ?? "Uncategorized";
          const entry = groupMap.get(groupId) ?? { groupId, groupName, amount: 0 };
          entry.amount += Math.abs(tx.amount);
          groupMap.set(groupId, entry);
        }

        expensesByGroup.push({
          year: y, month: m,
          label: d.toLocaleDateString("en-GB", { month: "short" }),
          groups: Array.from(groupMap.values()).sort((a, b) => b.amount - a.amount),
        });
      }

      // 12-month fund balance history
      const fundHistory: Array<{ year: number; month: number; label: string; totalAvailable: number }> = [];

      for (let i = 11; i >= 0; i--) {
        const d = new Date(input.year, input.month - 1 - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;

        // Sum all fund allocations up to and including this month
        const allocations = await ctx.prisma.fundTrackerAllocation.aggregate({
          where: {
            fund: {
              householdId: ctx.householdId,
              userId: ctx.userId,
              visibility: input.visibility,
              isArchived: false,
            },
            tracker: {
              OR: [
                { year: { lt: y } },
                { year: y, month: { lte: m } },
              ],
            },
          },
          _sum: { amount: true },
        });

        // Sum all fund spending up to end of this month
        const { end: monthEnd } = getMonthRange(y, m);
        const spending = await ctx.prisma.transaction.aggregate({
          where: {
            type: "FUND",
            fund: {
              householdId: ctx.householdId,
              userId: ctx.userId,
              visibility: input.visibility,
              isArchived: false,
            },
            ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
            account: { type: { in: LIQUID_ACCOUNT_TYPES } },
            isInitialBalance: false,
            OR: [
              { accrualDate: { lte: monthEnd } },
              { accrualDate: null, date: { lte: monthEnd } },
            ],
          },
          _sum: { amount: true },
        });

        const totalBudgeted = allocations._sum.amount ?? 0;
        const totalSpent = -(spending._sum.amount ?? 0); // expenses are negative
        const totalAvailable = totalBudgeted - totalSpent;

        fundHistory.push({
          year: y, month: m,
          label: d.toLocaleDateString("en-GB", { month: "short" }),
          totalAvailable,
        });
      }

      return { current, compare, deltas, trends: { months: trendMonths }, expensesByGroup, fundHistory };
    }),

  /** Fund summary for dashboard — simplified view of all funds */
  fundSummary: householdProcedure
    .input(z.object({
      month: z.number().int().min(1).max(12),
      year: z.number().int().min(2020).max(2100),
      visibility: z.enum(["SHARED", "PERSONAL"]),
    }))
    .query(async ({ ctx, input }) => {
      const funds = await ctx.prisma.fund.findMany({
        where: {
          householdId: ctx.householdId,
          userId: ctx.userId,
          visibility: input.visibility,
          isArchived: false,
        },
        include: {
          allocations: true,
          entries: {
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

      // Find this month's tracker
      const thisMonthTracker = await ctx.prisma.tracker.findUnique({
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

      // Fetch tracker metadata for date filtering
      const allTrackerIds = [...new Set(funds.flatMap((f) => f.allocations.map((a) => a.trackerId)))];
      const trackers = allTrackerIds.length > 0
        ? await ctx.prisma.tracker.findMany({
            where: { id: { in: allTrackerIds } },
            select: { id: true, month: true, year: true },
          })
        : [];
      const trackerDateMap = new Map(trackers.map((t) => [t.id, t]));

      const visibilityFilter = visibleTransactionsWhere(ctx.userId, ctx.householdId);
      const liquidFilter = { account: { type: { in: LIQUID_ACCOUNT_TYPES } } };

      let totalAvailable = 0;
      let totalBudgeted = 0;

      const fundResults = await Promise.all(
        funds.map(async (fund) => {
          // This month's allocation
          const thisMonthBudget = thisMonthTracker
            ? fund.allocations.find((a) => a.trackerId === thisMonthTracker.id)?.amount ?? 0
            : 0;

          // Total budgeted across all months up to and including this month
          let fundTotalBudgeted = 0;
          for (const alloc of fund.allocations) {
            const t = trackerDateMap.get(alloc.trackerId);
            if (t && (t.year < input.year || (t.year === input.year && t.month <= input.month))) {
              fundTotalBudgeted += alloc.amount;
            }
          }

          // Total spending up to end of selected month
          const spendingAgg = await ctx.prisma.transaction.aggregate({
            where: {
              AND: [
                visibilityFilter,
                liquidFilter,
                { fundId: fund.id },
                { isInitialBalance: false },
                { type: "FUND" },
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
          const totalSpending = -(spendingAgg._sum.amount ?? 0);

          // This month's spending
          const thisMonthAgg = await ctx.prisma.transaction.aggregate({
            where: {
              AND: [
                visibilityFilter,
                liquidFilter,
                { fundId: fund.id },
                { isInitialBalance: false },
                { type: "FUND" },
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
          const thisMonthActual = -(thisMonthAgg._sum.amount ?? 0);

          // Adjustments
          const adjustments = fund.entries.reduce((sum, e) => sum + e.amount, 0);

          // Available = total budgeted - total spending + adjustments
          const available = fundTotalBudgeted - totalSpending + adjustments;

          // Target from line items (yearly total)
          const target = fund.lineItems.length > 0
            ? fund.lineItems.reduce((s, li) => s + li.period * li.amount, 0)
            : null;

          totalAvailable += available;
          totalBudgeted += thisMonthBudget;

          return {
            id: fund.id,
            name: fund.name,
            icon: fund.icon,
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
