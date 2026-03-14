import { z } from "zod/v4";
import { router, householdProcedure } from "../init";
import { visibleAccountsWhere } from "@/lib/privacy";
import { ACCOUNT_TYPE_META } from "@/lib/account-types";
import { captureNetWorthSnapshot, backfillNetWorthSnapshots } from "@/lib/finance/net-worth-snapshot";

export const netWorthRouter = router({
  getSummary: householdProcedure
    .input(
      z.object({
        visibility: z.enum(["SHARED", "PERSONAL"]).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const accounts = await ctx.prisma.financialAccount.findMany({
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
        },
      });

      const assetAccounts = accounts.filter((a) => !ACCOUNT_TYPE_META[a.type]?.isLiability);
      const liabilityAccounts = accounts.filter((a) => ACCOUNT_TYPE_META[a.type]?.isLiability);

      const totalAssets = assetAccounts.reduce((sum, a) => sum + a.balance, 0);
      const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + Math.abs(a.balance), 0);
      const netWorth = totalAssets - totalLiabilities;

      return {
        netWorth,
        totalAssets,
        totalLiabilities,
        breakdown: {
          accounts: accounts.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            ownership: a.ownership,
            balance: a.balance,
            currency: a.currency,
          })),
        },
      };
    }),

  captureSnapshot: householdProcedure
    .input(
      z.object({
        year: z.number().int().min(2000).max(2100).optional(),
        month: z.number().int().min(1).max(12).optional(),
        visibility: z.enum(["SHARED", "PERSONAL"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const year = input.year ?? now.getFullYear();
      const month = input.month ?? now.getMonth() + 1;

      const snapshot = await captureNetWorthSnapshot(
        ctx.prisma,
        ctx.householdId,
        ctx.userId,
        input.visibility,
        year,
        month
      );

      return snapshot;
    }),

  getTrend: householdProcedure
    .input(
      z.object({
        visibility: z.enum(["SHARED", "PERSONAL"]),
        months: z.number().int().min(3).max(36).default(12),
      })
    )
    .query(async ({ ctx, input }) => {
      const snapshots = await ctx.prisma.netWorthSnapshot.findMany({
        where: {
          householdId: ctx.householdId,
          userId: ctx.userId,
          visibility: input.visibility,
        },
        orderBy: [{ year: "asc" }, { month: "asc" }],
        take: input.months,
      });

      const dataPoints = snapshots.map((s) => ({
        year: s.year,
        month: s.month,
        label: new Date(s.year, s.month - 1).toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        }),
        totalAssets: s.totalAssets,
        totalLiabilities: s.totalLiabilities,
        netWorth: s.netWorth,
      }));

      const currentNetWorth = dataPoints.at(-1)?.netWorth ?? 0;
      const oldestNetWorth = dataPoints[0]?.netWorth ?? 0;
      const changeAmount = currentNetWorth - oldestNetWorth;
      const changePercent =
        oldestNetWorth !== 0
          ? Math.round((changeAmount / Math.abs(oldestNetWorth)) * 10000) / 100
          : 0;

      return { dataPoints, currentNetWorth, oldestNetWorth, changeAmount, changePercent };
    }),

  backfillSnapshots: householdProcedure
    .input(
      z.object({
        visibility: z.enum(["SHARED", "PERSONAL"]),
        monthsBack: z.number().int().min(1).max(36).default(12),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const created = await backfillNetWorthSnapshots(
        ctx.prisma,
        ctx.householdId,
        ctx.userId,
        input.visibility,
        input.monthsBack
      );
      return { created };
    }),
});
