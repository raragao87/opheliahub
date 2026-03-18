import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";

export const fundRouter = router({
  // List all active funds for visibility scope with computed balances
  list: householdProcedure
    .input(
      z.object({
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .query(async ({ ctx, input }) => {
      const funds = await ctx.prisma.fund.findMany({
        where: {
          householdId: ctx.householdId,
          userId: ctx.userId,
          visibility: input.visibility,
          isArchived: false,
        },
        include: {
          entries: true,
          linkedAccount: {
            select: { id: true, name: true, balance: true, currency: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      });

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      return funds.map((fund) => {
        let balance = 0;
        let thisMonthContribution = 0;
        let thisMonthWithdrawal = 0;

        for (const entry of fund.entries) {
          if (entry.type === "CONTRIBUTION") balance += entry.amount;
          else if (entry.type === "WITHDRAWAL") balance -= entry.amount;
          else if (entry.type === "ADJUSTMENT") balance += entry.amount;

          if (entry.year === currentYear && entry.month === currentMonth) {
            if (entry.type === "CONTRIBUTION")
              thisMonthContribution += entry.amount;
            if (entry.type === "WITHDRAWAL")
              thisMonthWithdrawal += entry.amount;
          }
        }

        const targetProgress =
          fund.targetAmount && fund.targetAmount > 0
            ? Math.min(
                100,
                Math.round((balance / fund.targetAmount) * 100)
              )
            : null;

        let monthsToTarget: number | null = null;
        if (fund.targetDate) {
          const target = new Date(fund.targetDate);
          monthsToTarget = Math.max(
            0,
            (target.getFullYear() - currentYear) * 12 +
              (target.getMonth() + 1 - currentMonth)
          );
        }

        return {
          id: fund.id,
          name: fund.name,
          icon: fund.icon,
          color: fund.color,
          balance,
          monthlyContribution: fund.monthlyContribution,
          targetAmount: fund.targetAmount,
          targetDate: fund.targetDate,
          targetProgress,
          monthsToTarget,
          thisMonthContribution,
          thisMonthWithdrawal,
          thisMonthNet: thisMonthContribution - thisMonthWithdrawal,
          linkedAccount: fund.linkedAccount,
          sortOrder: fund.sortOrder,
        };
      });
    }),

  // Get fund with all entries for edit dialog
  getWithEntries: householdProcedure
    .input(z.object({ fundId: z.string() }))
    .query(async ({ ctx, input }) => {
      const fund = await ctx.prisma.fund.findFirst({
        where: {
          id: input.fundId,
          householdId: ctx.householdId,
          userId: ctx.userId,
        },
        include: {
          entries: { orderBy: { createdAt: "desc" } },
          linkedAccount: {
            select: { id: true, name: true, balance: true, currency: true },
          },
        },
      });
      if (!fund) throw new TRPCError({ code: "NOT_FOUND" });
      return fund;
    }),

  // Create a new fund
  create: householdProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        icon: z.string().max(10).optional(),
        color: z.string().max(20).optional(),
        linkedAccountId: z.string().optional(),
        targetAmount: z.number().int().min(0).optional(),
        targetDate: z.string().optional(), // ISO date string
        monthlyContribution: z.number().int().min(0).default(0),
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const maxSort = await ctx.prisma.fund.aggregate({
        where: {
          householdId: ctx.householdId,
          userId: ctx.userId,
          visibility: input.visibility,
        },
        _max: { sortOrder: true },
      });

      return ctx.prisma.fund.create({
        data: {
          name: input.name,
          icon: input.icon,
          color: input.color,
          linkedAccountId: input.linkedAccountId,
          targetAmount: input.targetAmount,
          targetDate: input.targetDate
            ? new Date(input.targetDate)
            : undefined,
          monthlyContribution: input.monthlyContribution,
          visibility: input.visibility,
          householdId: ctx.householdId,
          userId: ctx.userId,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        },
      });
    }),

  // Update fund
  update: householdProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        icon: z.string().max(10).optional(),
        color: z.string().max(20).optional(),
        linkedAccountId: z.string().nullable().optional(),
        targetAmount: z.number().int().min(0).nullable().optional(),
        targetDate: z.string().nullable().optional(),
        monthlyContribution: z.number().int().min(0).optional(),
        isArchived: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, targetDate, ...rest } = input;
      return ctx.prisma.fund.update({
        where: { id },
        data: {
          ...rest,
          ...(targetDate !== undefined && {
            targetDate: targetDate ? new Date(targetDate) : null,
          }),
        },
      });
    }),

  // Delete fund (only if no entries; otherwise archive)
  delete: householdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const entryCount = await ctx.prisma.fundEntry.count({
        where: { fundId: input.id },
      });
      if (entryCount > 0) {
        return ctx.prisma.fund.update({
          where: { id: input.id },
          data: { isArchived: true },
        });
      }
      return ctx.prisma.fund.delete({ where: { id: input.id } });
    }),

  // Add entry to a fund
  addEntry: householdProcedure
    .input(
      z.object({
        fundId: z.string(),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        type: z.enum(["CONTRIBUTION", "WITHDRAWAL", "ADJUSTMENT"]),
        amount: z.number().int().min(1), // always positive cents
        note: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.fundEntry.create({
        data: {
          fundId: input.fundId,
          year: input.year,
          month: input.month,
          type: input.type,
          amount: input.amount,
          note: input.note,
        },
      });
    }),

  // Delete an entry
  deleteEntry: householdProcedure
    .input(z.object({ entryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.fundEntry.delete({ where: { id: input.entryId } });
    }),

  // Contribute all: add monthly contribution to all funds for the current month
  contributeAll: householdProcedure
    .input(
      z.object({
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const funds = await ctx.prisma.fund.findMany({
        where: {
          householdId: ctx.householdId,
          userId: ctx.userId,
          visibility: input.visibility,
          isArchived: false,
          monthlyContribution: { gt: 0 },
        },
        include: {
          entries: {
            where: {
              year: input.year,
              month: input.month,
              type: "CONTRIBUTION",
            },
          },
        },
      });

      // Skip funds that already have a contribution this month
      const fundsToContribute = funds.filter((f) => f.entries.length === 0);

      if (fundsToContribute.length === 0) {
        return { count: 0, totalAmount: 0 };
      }

      const entries = fundsToContribute.map((f) => ({
        fundId: f.id,
        year: input.year,
        month: input.month,
        type: "CONTRIBUTION" as const,
        amount: f.monthlyContribution,
      }));

      await ctx.prisma.fundEntry.createMany({ data: entries });

      return {
        count: fundsToContribute.length,
        totalAmount: entries.reduce((sum, e) => sum + e.amount, 0),
      };
    }),

  // Reorder funds
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
          ctx.prisma.fund.update({
            where: { id: item.id },
            data: { sortOrder: item.sortOrder },
          })
        )
      );
    }),
});
