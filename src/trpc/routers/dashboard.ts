import { z } from "zod/v4";
import { router, householdProcedure } from "../init";
import { visibleTransactionsWhere, visibleAccountsWhere } from "@/lib/privacy";
import { getMonthRange } from "@/lib/date";

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
          type: { not: "TRANSFER" as const },
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

      // 6-month trend
      const trendMonths: Array<{ year: number; month: number; label: string; income: number; expenses: number; net: number }> = [];
      for (let i = 5; i >= 0; i--) {
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
            type: { not: "TRANSFER" },
          },
          _sum: { amount: true },
        });

        const income = agg.find((a) => a.type === "INCOME")?._sum.amount ?? 0;
        const expenses = agg.find((a) => a.type === "EXPENSE")?._sum.amount ?? 0;
        trendMonths.push({
          year: y, month: m,
          label: d.toLocaleDateString("en-GB", { month: "short" }),
          income, expenses, net: income + expenses,
        });
      }

      return { current, compare, deltas, trends: { months: trendMonths } };
    }),
});
