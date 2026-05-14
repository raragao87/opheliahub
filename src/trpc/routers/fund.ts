import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";
import { getMonthRange } from "@/lib/date";
import { visibleTransactionsWhere } from "@/lib/privacy";
import { SPENDING_ACCOUNT_TYPES } from "@/lib/account-types";

export const fundRouter = router({
  list: householdProcedure
    .input(
      z.object({
        budgetScope: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
        month: z.number().int().min(1).max(12),
        year: z.number().int(),
      })
    )
    .query(async ({ ctx, input }) => {
      const categories = await ctx.prisma.category.findMany({
        where: {
          householdId: ctx.householdId,
          type: "FUND",
          budgetScope: input.budgetScope,
          isArchived: false,
        },
        include: {
          fundEntries: {
            where: { type: "ADJUSTMENT" },
            orderBy: { createdAt: "desc" },
            select: { id: true, amount: true, note: true, year: true, month: true, createdAt: true },
          },
          fundTrackerAllocations: true,
          lineItems: { orderBy: { sortOrder: "asc" } },
          linkedAccount: {
            select: { id: true, name: true, balance: true, currency: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      });

      const { start: monthStart, end: monthEnd } = getMonthRange(
        input.year,
        input.month,
      );

      const visibilityFilter = visibleTransactionsWhere(
        ctx.userId,
        ctx.householdId,
      );
      const liquidFilter = {
        account: { type: { in: SPENDING_ACCOUNT_TYPES } },
      };

      const effectiveDateFilterUpTo = (endDate: Date) => ({
        OR: [
          { accrualDate: { lte: endDate } },
          { accrualDate: null, date: { lte: endDate } },
        ],
      });
      const effectiveDateFilterRange = (rangeStart: Date, rangeEnd: Date) => ({
        OR: [
          { accrualDate: { gte: rangeStart, lte: rangeEnd } },
          { accrualDate: null, date: { gte: rangeStart, lte: rangeEnd } },
        ],
      });

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

      const allTrackerIds = [
        ...new Set(categories.flatMap((c) => c.fundTrackerAllocations.map((a) => a.trackerId))),
      ];
      const trackers =
        allTrackerIds.length > 0
          ? await ctx.prisma.tracker.findMany({
              where: { id: { in: allTrackerIds } },
              select: { id: true, month: true, year: true },
            })
          : [];
      const trackerDateMap = new Map(trackers.map((t) => [t.id, t]));

      const linkedAccount = categories.find((c) => c.linkedAccount)?.linkedAccount ?? null;
      let historicalAccountBalance: number | null = null;
      if (linkedAccount) {
        const endOfSelectedMonth = new Date(input.year, input.month, 1);
        const now = new Date();

        if (endOfSelectedMonth >= now) {
          historicalAccountBalance = linkedAccount.balance;
        } else {
          const transactionsAfter = await ctx.prisma.transaction.aggregate({
            where: {
              accountId: linkedAccount.id,
              date: { gte: endOfSelectedMonth },
              ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
            },
            _sum: { amount: true },
          });
          historicalAccountBalance = linkedAccount.balance - (transactionsAfter._sum.amount ?? 0);
        }
      }

      const fundResults = await Promise.all(
        categories.map(async (cat) => {
          const thisMonthAllocation = thisMonthTracker
            ? cat.fundTrackerAllocations.find(
                (a) => a.trackerId === thisMonthTracker.id,
              )?.amount ?? 0
            : 0;

          let totalBudgeted = 0;
          for (const alloc of cat.fundTrackerAllocations) {
            const t = trackerDateMap.get(alloc.trackerId);
            if (
              t &&
              (t.year < input.year ||
                (t.year === input.year && t.month <= input.month))
            ) {
              totalBudgeted += alloc.amount;
            }
          }

          const spendingAgg = await ctx.prisma.transaction.aggregate({
            where: {
              AND: [
                visibilityFilter,
                liquidFilter,
                { categoryId: cat.id, type: "FUND" },
                { isInitialBalance: false },
                effectiveDateFilterUpTo(monthEnd),
              ],
            },
            _sum: { amount: true },
          });
          const totalSpending = -(spendingAgg._sum.amount ?? 0);

          const thisMonthAgg = await ctx.prisma.transaction.aggregate({
            where: {
              AND: [
                visibilityFilter,
                liquidFilter,
                { categoryId: cat.id, type: "FUND" },
                { isInitialBalance: false },
                effectiveDateFilterRange(monthStart, monthEnd),
              ],
            },
            _sum: { amount: true },
          });
          const thisMonthActual = -(thisMonthAgg._sum.amount ?? 0);

          const adjustments = cat.fundEntries.reduce(
            (sum, e) => sum + e.amount,
            0,
          );

          const available = totalBudgeted - totalSpending + adjustments;

          return {
            id: cat.id,
            name: cat.name,
            icon: cat.icon,
            color: cat.color,
            budget: thisMonthAllocation,
            thisMonthActual,
            available,
            totalBudgeted,
            totalSpending,
            adjustments,
            entries: cat.fundEntries,
            lineItems: cat.lineItems,
            linkedAccount: cat.linkedAccount,
            sortOrder: cat.sortOrder,
          };
        }),
      );

      return {
        funds: fundResults,
        historicalAccountBalance,
      };
    }),

  listForDropdown: householdProcedure
    .input(
      z.object({
        budgetScope: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.category.findMany({
        where: {
          householdId: ctx.householdId,
          type: "FUND",
          budgetScope: input.budgetScope,
          isArchived: false,
        },
        select: { id: true, name: true, icon: true },
        orderBy: { sortOrder: "asc" },
      });
    }),

  create: householdProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        icon: z.string().max(10).optional(),
        color: z.string().max(20).optional(),
        linkedAccountId: z.string().optional(),
        budgetScope: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const maxSort = await ctx.prisma.category.aggregate({
        where: {
          householdId: ctx.householdId,
          type: "FUND",
          budgetScope: input.budgetScope,
        },
        _max: { sortOrder: true },
      });

      return ctx.prisma.category.create({
        data: {
          name: input.name,
          icon: input.icon,
          color: input.color,
          type: "FUND",
          householdId: ctx.householdId,
          budgetScope: input.budgetScope,
          linkedAccountId: input.linkedAccountId,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
          parentId: null,
        },
      });
    }),

  update: householdProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        icon: z.string().max(10).optional(),
        color: z.string().max(20).optional(),
        linkedAccountId: z.string().nullable().optional(),
        isArchived: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      return ctx.prisma.category.update({
        where: { id },
        data: rest,
      });
    }),

  delete: householdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [entryCount, txnCount] = await Promise.all([
        ctx.prisma.fundEntry.count({ where: { categoryId: input.id } }),
        ctx.prisma.transaction.count({ where: { categoryId: input.id, type: "FUND" } }),
      ]);
      if (entryCount > 0 || txnCount > 0) {
        return ctx.prisma.category.update({
          where: { id: input.id },
          data: { isArchived: true },
        });
      }
      return ctx.prisma.category.delete({ where: { id: input.id } });
    }),

  addEntry: householdProcedure
    .input(
      z.object({
        fundId: z.string(),
        amount: z.number().int(),
        note: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      return ctx.prisma.fundEntry.create({
        data: {
          categoryId: input.fundId,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          type: "ADJUSTMENT",
          amount: input.amount,
          note: input.note,
        },
      });
    }),

  deleteEntry: householdProcedure
    .input(z.object({ entryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.fundEntry.delete({ where: { id: input.entryId } });
    }),

  setLineItems: householdProcedure
    .input(
      z.object({
        fundId: z.string(),
        items: z
          .array(
            z.object({
              description: z.string().min(1).max(200),
              period: z.number().int().min(1).max(365),
              amount: z.number().int().min(0),
              sortOrder: z.number().int(),
            })
          )
          .max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const category = await ctx.prisma.category.findFirst({
        where: {
          id: input.fundId,
          householdId: ctx.householdId,
          type: "FUND",
        },
      });
      if (!category) throw new TRPCError({ code: "NOT_FOUND" });

      const yearlyTotal = input.items.reduce(
        (s, li) => s + li.period * li.amount,
        0,
      );
      const computedMonthly = Math.round(yearlyTotal / 12);

      await ctx.prisma.$transaction([
        ctx.prisma.budgetLineItem.deleteMany({
          where: { categoryId: input.fundId },
        }),
        ...(input.items.length > 0
          ? [
              ctx.prisma.budgetLineItem.createMany({
                data: input.items.map((li) => ({
                  categoryId: input.fundId,
                  description: li.description,
                  period: li.period,
                  amount: li.amount,
                  sortOrder: li.sortOrder,
                })),
              }),
            ]
          : []),
      ]);

      return {
        computedMonthly,
        yearlyTotal,
        itemCount: input.items.length,
      };
    }),

  updateLinkedAccount: householdProcedure
    .input(
      z.object({
        budgetScope: z.enum(["SHARED", "PERSONAL"]),
        linkedAccountId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.category.updateMany({
        where: {
          householdId: ctx.householdId,
          type: "FUND",
          budgetScope: input.budgetScope,
          isArchived: false,
        },
        data: {
          linkedAccountId: input.linkedAccountId,
        },
      });
    }),

  reorder: householdProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            id: z.string(),
            sortOrder: z.number().int(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await Promise.all(
        input.items.map((item) =>
          ctx.prisma.category.update({
            where: { id: item.id },
            data: { sortOrder: item.sortOrder },
          })
        ),
      );
    }),
});
