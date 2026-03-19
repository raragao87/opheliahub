import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";
import { getMonthRange } from "@/lib/date";
import { visibleTransactionsWhere } from "@/lib/privacy";
import { LIQUID_ACCOUNT_TYPES } from "@/lib/account-types";

export const fundRouter = router({
  // List all active funds with transaction-based computation
  list: householdProcedure
    .input(
      z.object({
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
        month: z.number().int().min(1).max(12),
        year: z.number().int(),
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
          allocations: true, // ALL months' allocations
          entries: {
            where: { type: "ADJUSTMENT" },
            orderBy: { createdAt: "desc" },
            select: { id: true, amount: true, note: true, year: true, month: true, createdAt: true },
          },
          lineItems: { orderBy: { sortOrder: "asc" } },
          linkedAccount: {
            select: { id: true, name: true, balance: true, currency: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      });

      const { start: monthStart, end: monthEnd } = getMonthRange(
        input.year,
        input.month
      );

      // Privacy + liquid filter for transaction queries
      const visibilityFilter = visibleTransactionsWhere(
        ctx.userId,
        ctx.householdId
      );
      const liquidFilter = {
        account: { type: { in: LIQUID_ACCOUNT_TYPES } },
      };

      // Effective date filter (respects accrualDate)
      const effectiveDateFilterUpTo = (endDate: Date) => ({
        OR: [
          { accrualDate: { lte: endDate } },
          { accrualDate: null, date: { lte: endDate } },
        ],
      });
      const effectiveDateFilterRange = (rangeStart: Date, rangeEnd: Date) => ({
        OR: [
          { accrualDate: { gte: rangeStart, lte: rangeEnd } },
          {
            accrualDate: null,
            date: { gte: rangeStart, lte: rangeEnd },
          },
        ],
      });

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

      // Fetch all tracker metadata to map allocation -> month/year
      const allTrackerIds = [
        ...new Set(funds.flatMap((f) => f.allocations.map((a) => a.trackerId))),
      ];
      const trackers =
        allTrackerIds.length > 0
          ? await ctx.prisma.tracker.findMany({
              where: { id: { in: allTrackerIds } },
              select: { id: true, month: true, year: true },
            })
          : [];
      const trackerDateMap = new Map(trackers.map((t) => [t.id, t]));

      // Compute historical account balance for the linked account
      const linkedAccount = funds.find((f) => f.linkedAccount)?.linkedAccount ?? null;
      let historicalAccountBalance: number | null = null;
      if (linkedAccount) {
        const endOfSelectedMonth = new Date(input.year, input.month, 1); // start of next month
        const now = new Date();

        if (endOfSelectedMonth >= now) {
          // Current or future month — use live balance
          historicalAccountBalance = linkedAccount.balance;
        } else {
          // Past month — subtract transactions that happened AFTER that month
          const transactionsAfter = await ctx.prisma.transaction.aggregate({
            where: {
              accountId: linkedAccount.id,
              date: { gte: endOfSelectedMonth },
            },
            _sum: { amount: true },
          });
          historicalAccountBalance = linkedAccount.balance - (transactionsAfter._sum.amount ?? 0);
        }
      }

      const fundResults = await Promise.all(
        funds.map(async (fund) => {
          // This month's allocation
          const thisMonthAllocation = thisMonthTracker
            ? fund.allocations.find(
                (a) => a.trackerId === thisMonthTracker.id
              )?.amount ?? 0
            : 0;

          // Total budgeted across all months up to and including this month
          let totalBudgeted = 0;
          for (const alloc of fund.allocations) {
            const t = trackerDateMap.get(alloc.trackerId);
            if (
              t &&
              (t.year < input.year ||
                (t.year === input.year && t.month <= input.month))
            ) {
              totalBudgeted += alloc.amount;
            }
          }

          // Total spending from transactions assigned to this fund (up to end of selected month)
          const spendingAgg = await ctx.prisma.transaction.aggregate({
            where: {
              AND: [
                visibilityFilter,
                liquidFilter,
                { fundId: fund.id },
                { isInitialBalance: false },
                effectiveDateFilterUpTo(monthEnd),
              ],
            },
            _sum: { amount: true },
          });
          const totalSpending = Math.abs(spendingAgg._sum.amount ?? 0);

          // This month's spending only
          const thisMonthAgg = await ctx.prisma.transaction.aggregate({
            where: {
              AND: [
                visibilityFilter,
                liquidFilter,
                { fundId: fund.id },
                { isInitialBalance: false },
                effectiveDateFilterRange(monthStart, monthEnd),
              ],
            },
            _sum: { amount: true },
          });
          const thisMonthActual = Math.abs(thisMonthAgg._sum.amount ?? 0);

          // Adjustments from FundEntry (ADJUSTMENT type only)
          const adjustments = fund.entries.reduce(
            (sum, e) => sum + e.amount,
            0
          );

          // Available = total budgeted − total spending + adjustments
          const available = totalBudgeted - totalSpending + adjustments;

          return {
            id: fund.id,
            name: fund.name,
            icon: fund.icon,
            color: fund.color,
            budget: thisMonthAllocation, // Budget column (this month only)
            thisMonthActual,
            available,
            totalBudgeted,
            totalSpending,
            adjustments,
            entries: fund.entries,
            lineItems: fund.lineItems,
            linkedAccount: fund.linkedAccount,
            sortOrder: fund.sortOrder,
          };
        })
      );

      return {
        funds: fundResults,
        historicalAccountBalance,
      };
    }),

  // Lightweight list for dropdowns (no transaction computation)
  listForDropdown: householdProcedure
    .input(
      z.object({
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.fund.findMany({
        where: {
          householdId: ctx.householdId,
          userId: ctx.userId,
          visibility: input.visibility,
          isArchived: false,
        },
        select: { id: true, name: true, icon: true },
        orderBy: { sortOrder: "asc" },
      });
    }),

  // Create a new fund
  create: householdProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        icon: z.string().max(10).optional(),
        color: z.string().max(20).optional(),
        linkedAccountId: z.string().optional(),
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
        isArchived: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      return ctx.prisma.fund.update({
        where: { id },
        data: rest,
      });
    }),

  // Delete fund (only if no entries/transactions; otherwise archive)
  delete: householdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [entryCount, txnCount] = await Promise.all([
        ctx.prisma.fundEntry.count({ where: { fundId: input.id } }),
        ctx.prisma.transaction.count({ where: { fundId: input.id } }),
      ]);
      if (entryCount > 0 || txnCount > 0) {
        return ctx.prisma.fund.update({
          where: { id: input.id },
          data: { isArchived: true },
        });
      }
      return ctx.prisma.fund.delete({ where: { id: input.id } });
    }),

  // Add adjustment entry to a fund
  addEntry: householdProcedure
    .input(
      z.object({
        fundId: z.string(),
        amount: z.number().int(), // can be positive or negative
        note: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      return ctx.prisma.fundEntry.create({
        data: {
          fundId: input.fundId,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          type: "ADJUSTMENT",
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

  // Set line items for contribution calculator
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
      const fund = await ctx.prisma.fund.findFirst({
        where: {
          id: input.fundId,
          householdId: ctx.householdId,
          userId: ctx.userId,
        },
      });
      if (!fund) throw new TRPCError({ code: "NOT_FOUND" });

      const yearlyTotal = input.items.reduce(
        (s, li) => s + li.period * li.amount,
        0
      );
      const computedMonthly = Math.round(yearlyTotal / 12);

      await ctx.prisma.$transaction([
        ctx.prisma.fundLineItem.deleteMany({
          where: { fundId: input.fundId },
        }),
        ...(input.items.length > 0
          ? [
              ctx.prisma.fundLineItem.createMany({
                data: input.items.map((li) => ({
                  fundId: input.fundId,
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

  // Update linked account for all funds in a visibility scope
  updateLinkedAccount: householdProcedure
    .input(
      z.object({
        visibility: z.enum(["SHARED", "PERSONAL"]),
        linkedAccountId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.fund.updateMany({
        where: {
          householdId: ctx.householdId,
          userId: ctx.userId,
          visibility: input.visibility,
          isArchived: false,
        },
        data: {
          linkedAccountId: input.linkedAccountId,
        },
      });
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
