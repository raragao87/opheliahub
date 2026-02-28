import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";
import { visibleAccountsWhere } from "@/lib/privacy";

export const accountRouter = router({
  list: householdProcedure.query(async ({ ctx }) => {
    return ctx.prisma.financialAccount.findMany({
      where: visibleAccountsWhere(ctx.userId, ctx.householdId),
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: {
        owner: { select: { id: true, name: true, image: true } },
      },
    });
  }),

  getById: householdProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const account = await ctx.prisma.financialAccount.findFirst({
        where: {
          id: input.id,
          ...visibleAccountsWhere(ctx.userId, ctx.householdId),
        },
        include: {
          owner: { select: { id: true, name: true, image: true } },
        },
      });

      if (!account) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
      }

      return account;
    }),

  create: householdProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        type: z.enum([
          "CHECKING",
          "CREDIT_CARD",
          "SAVINGS",
          "INVESTMENT",
          "CASH",
          "CRYPTO",
          "LOAN",
          "PROPERTY",
          "VEHICLE",
          "MORTGAGE",
          "OTHER_ASSET",
          "OTHER_DEBT",
        ]),
        ownership: z.enum(["PERSONAL", "SHARED"]),
        currency: z.string().length(3).default("EUR"),
        institution: z.string().max(100).optional(),
        balance: z.number().int().default(0),
        icon: z.string().optional(),
        color: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { metadata, ...rest } = input;

      // Create account + "Initial Balance" transaction atomically
      const account = await ctx.prisma.$transaction(async (tx) => {
        const newAccount = await tx.financialAccount.create({
          data: {
            ...rest,
            // Balance starts at 0 — the Initial Balance transaction will set it
            balance: 0,
            ...(metadata && { metadata: metadata as Record<string, string | number | boolean | null> }),
            ownerId: ctx.userId,
            householdId: input.ownership === "SHARED" ? ctx.householdId : null,
          },
        });

        // Always create an "Initial Balance" transaction (even for €0.00)
        const balance = input.balance ?? 0;
        await tx.transaction.create({
          data: {
            amount: balance,
            currency: input.currency ?? "EUR",
            type: balance >= 0 ? "INCOME" : "EXPENSE",
            visibility: input.ownership as "SHARED" | "PERSONAL",
            description: "Initial Balance",
            date: new Date(),
            isInitialBalance: true,
            accountId: newAccount.id,
            userId: ctx.userId,
          },
        });

        // Now set the actual balance
        if (balance !== 0) {
          return tx.financialAccount.update({
            where: { id: newAccount.id },
            data: { balance },
          });
        }

        return newAccount;
      });

      return account;
    }),

  update: householdProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        type: z
          .enum([
            "CHECKING",
            "CREDIT_CARD",
            "SAVINGS",
            "INVESTMENT",
            "CASH",
            "CRYPTO",
            "LOAN",
            "PROPERTY",
            "VEHICLE",
            "MORTGAGE",
            "OTHER_ASSET",
            "OTHER_DEBT",
          ])
          .optional(),
        ownership: z.enum(["PERSONAL", "SHARED"]).optional(),
        currency: z.string().length(3).optional(),
        institution: z.string().max(100).optional().nullable(),
        icon: z.string().optional(),
        color: z.string().optional(),
        isActive: z.boolean().optional(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ownership, ...data } = input;

      // Verify ownership
      const account = await ctx.prisma.financialAccount.findFirst({
        where: { id, ownerId: ctx.userId },
      });

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found or you don't have permission to update it.",
        });
      }

      return ctx.prisma.financialAccount.update({
        where: { id },
        data: {
          ...data,
          ...(ownership && {
            ownership,
            householdId: ownership === "SHARED" ? ctx.householdId : null,
          }),
        },
      });
    }),

  delete: householdProcedure
    .input(
      z.object({
        id: z.string(),
        force: z.boolean().default(false), // true = delete account + all transactions permanently
      })
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.prisma.financialAccount.findFirst({
        where: { id: input.id, ownerId: ctx.userId },
        include: { _count: { select: { transactions: true } } },
      });

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found or you don't have permission.",
        });
      }

      // Force delete: remove all transactions first, then delete account
      if (input.force) {
        return ctx.prisma.$transaction(async (tx) => {
          // Delete transaction tags first (foreign key constraint)
          await tx.transactionTag.deleteMany({
            where: { transaction: { accountId: input.id } },
          });
          await tx.transaction.deleteMany({
            where: { accountId: input.id },
          });
          return tx.financialAccount.delete({
            where: { id: input.id },
          });
        });
      }

      // No transactions → safe to delete directly
      if (account._count.transactions === 0) {
        return ctx.prisma.financialAccount.delete({
          where: { id: input.id },
        });
      }

      // Has transactions but no force → archive
      return ctx.prisma.financialAccount.update({
        where: { id: input.id },
        data: { isActive: false },
      });
    }),

  /** Reconcile: set the new total balance and auto-create an adjustment transaction */
  reconcile: householdProcedure
    .input(
      z.object({
        id: z.string(),
        newBalance: z.number().int(), // cents
      })
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.prisma.financialAccount.findFirst({
        where: {
          id: input.id,
          ...visibleAccountsWhere(ctx.userId, ctx.householdId),
        },
      });

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found.",
        });
      }

      const adjustment = input.newBalance - account.balance;

      if (adjustment === 0) {
        return account; // nothing to do
      }

      // Create adjustment transaction + update balance in a transaction
      const updated = await ctx.prisma.$transaction(async (tx) => {
        await tx.transaction.create({
          data: {
            amount: adjustment,
            currency: account.currency,
            type: adjustment > 0 ? "INCOME" : "EXPENSE",
            visibility: account.ownership as "SHARED" | "PERSONAL",
            description: "Balance Adjustment",
            date: new Date(),
            accountId: account.id,
            userId: ctx.userId,
          },
        });

        return tx.financialAccount.update({
          where: { id: account.id },
          data: { balance: input.newBalance },
        });
      });

      return updated;
    }),
});
