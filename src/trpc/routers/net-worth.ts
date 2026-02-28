import { z } from "zod/v4";
import { router, householdProcedure } from "../init";
import { visibleAccountsWhere } from "@/lib/privacy";
import { ACCOUNT_TYPE_META } from "@/lib/account-types";

export const netWorthRouter = router({
  getSummary: householdProcedure
    .input(
      z.object({
        visibility: z.enum(["SHARED", "PERSONAL"]).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      // Fetch all visible accounts
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

      // Separate assets from liabilities using ACCOUNT_TYPE_META
      const assetAccounts = accounts.filter(
        (a) => !ACCOUNT_TYPE_META[a.type]?.isLiability
      );
      const liabilityAccounts = accounts.filter(
        (a) => ACCOUNT_TYPE_META[a.type]?.isLiability
      );

      const totalAssets = assetAccounts.reduce((sum, a) => sum + a.balance, 0);
      const totalLiabilities = liabilityAccounts.reduce(
        (sum, a) => sum + Math.abs(a.balance),
        0
      );
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
});
