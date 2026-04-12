import { z } from "zod/v4";
import { router, householdProcedure } from "../init";
import { visibleAccountsWhere } from "@/lib/privacy";

export const duplicatesRouter = router({
  /**
   * Returns pending duplicate alert count grouped by accountId.
   * Used by the sidebar to show per-account duplicate badges.
   */
  pendingByAccount: householdProcedure
    .input(z.object({ visibility: z.enum(["SHARED", "PERSONAL"]) }))
    .query(async ({ ctx, input }) => {
      const accounts = await ctx.prisma.financialAccount.findMany({
        where: visibleAccountsWhere(ctx.userId, ctx.householdId),
        select: { id: true, ownership: true },
      });
      const accountIds = accounts
        .filter((a) => a.ownership === input.visibility)
        .map((a) => a.id);

      if (accountIds.length === 0) return { byAccount: {} as Record<string, number> };

      const groups = await ctx.prisma.duplicateAlert.groupBy({
        by: ["accountId"],
        where: {
          userId: ctx.userId,
          accountId: { in: accountIds },
          status: "PENDING",
        },
        _count: { _all: true },
      });

      const byAccount: Record<string, number> = {};
      for (const g of groups) {
        byAccount[g.accountId] = g._count._all;
      }
      return { byAccount };
    }),

  /**
   * List pending duplicate alerts for a specific account (or all accounts).
   * Returns both transactions in each pair for the review UI.
   */
  listAlerts: householdProcedure
    .input(z.object({
      accountId: z.string().optional(),
      status: z.enum(["PENDING", "DISMISSED", "RESOLVED"]).default("PENDING"),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const alerts = await ctx.prisma.duplicateAlert.findMany({
        where: {
          userId: ctx.userId,
          status: input.status,
          ...(input.accountId ? { accountId: input.accountId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });

      // Fetch the actual transactions for each alert
      const txIds = new Set<string>();
      for (const a of alerts) {
        txIds.add(a.transactionIdA);
        txIds.add(a.transactionIdB);
      }

      const transactions = await ctx.prisma.transaction.findMany({
        where: { id: { in: [...txIds] } },
        select: {
          id: true,
          date: true,
          amount: true,
          description: true,
          displayName: true,
          currency: true,
          accountId: true,
          account: { select: { name: true } },
          category: { select: { id: true, name: true, icon: true } },
          importBatchId: true,
        },
      });

      const txMap = new Map(transactions.map((t) => [t.id, t]));

      return alerts.map((alert) => ({
        ...alert,
        transactionA: txMap.get(alert.transactionIdA) ?? null,
        transactionB: txMap.get(alert.transactionIdB) ?? null,
      }));
    }),

  /**
   * Dismiss a duplicate alert (mark as "not a duplicate").
   */
  dismiss: householdProcedure
    .input(z.object({ alertId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.duplicateAlert.updateMany({
        where: { id: input.alertId, userId: ctx.userId },
        data: { status: "DISMISSED" },
      });
      return { success: true };
    }),

  /**
   * Resolve a duplicate alert by deleting one of the transactions.
   */
  resolve: householdProcedure
    .input(z.object({
      alertId: z.string(),
      deleteTransactionId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const alert = await ctx.prisma.duplicateAlert.findFirst({
        where: { id: input.alertId, userId: ctx.userId, status: "PENDING" },
      });
      if (!alert) return { success: false };

      if (input.deleteTransactionId !== alert.transactionIdA &&
          input.deleteTransactionId !== alert.transactionIdB) {
        return { success: false };
      }

      await ctx.prisma.$transaction(async (tx) => {
        const txn = await tx.transaction.findUnique({
          where: { id: input.deleteTransactionId },
          select: { amount: true, accountId: true },
        });
        if (txn) {
          await tx.transaction.delete({ where: { id: input.deleteTransactionId } });
          await tx.financialAccount.update({
            where: { id: txn.accountId },
            data: { balance: { decrement: txn.amount } },
          });
        }
        await tx.duplicateAlert.update({
          where: { id: input.alertId },
          data: { status: "RESOLVED" },
        });
      });

      return { success: true };
    }),

  /**
   * Bulk dismiss all pending alerts for an account (or all).
   */
  dismissAll: householdProcedure
    .input(z.object({ accountId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.duplicateAlert.updateMany({
        where: {
          userId: ctx.userId,
          status: "PENDING",
          ...(input.accountId ? { accountId: input.accountId } : {}),
        },
        data: { status: "DISMISSED" },
      });
      return { dismissed: result.count };
    }),
});
