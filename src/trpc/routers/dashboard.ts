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
});
