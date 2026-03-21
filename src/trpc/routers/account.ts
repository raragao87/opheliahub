import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";
import { visibleAccountsWhere, visibleTransactionsWhere } from "@/lib/privacy";

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
        links: z.array(z.object({
          label: z.string().min(1).max(100),
          url: z.string().url().max(500),
        })).max(6).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ownership, ...data } = input;

      // Verify visibility (owner OR household member for shared accounts)
      const account = await ctx.prisma.financialAccount.findFirst({
        where: { id, ...visibleAccountsWhere(ctx.userId, ctx.householdId) },
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

  /**
   * Flip the sign of all imported transactions in an account.
   * Use to correct credit card accounts where expenses were imported as positive amounts.
   * The "Initial Balance" transaction is excluded — it was set correctly by the user.
   */
  flipTransactionSigns: householdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify the user owns this account
      const account = await ctx.prisma.financialAccount.findFirst({
        where: { id: input.id, ownerId: ctx.userId },
      });

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found or you don't have permission.",
        });
      }

      // Fetch all transactions except Initial Balance
      const transactions = await ctx.prisma.transaction.findMany({
        where: { accountId: input.id, isInitialBalance: false },
        select: { id: true, amount: true },
      });

      // Flip amount and rederive type for each transaction, then recalculate balance
      await ctx.prisma.$transaction(async (tx) => {
        for (const t of transactions) {
          const newAmount = -t.amount;
          const newType =
            newAmount > 0 ? "INCOME" : newAmount < 0 ? "EXPENSE" : "TRANSFER";
          await tx.transaction.update({
            where: { id: t.id },
            data: { amount: newAmount, type: newType },
          });
        }

        // Recalculate account balance from all transactions (including Initial Balance)
        const agg = await tx.transaction.aggregate({
          where: { accountId: input.id },
          _sum: { amount: true },
        });
        await tx.financialAccount.update({
          where: { id: input.id },
          data: { balance: agg._sum.amount ?? 0 },
        });
      });

      return { flipped: transactions.length };
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

  /** Generate an AI description and suggested links for an account */
  generateDescription: householdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { isOpheliaEnabled, chatCompletion, extractJSON } = await import("@/lib/ophelia");

      if (!isOpheliaEnabled()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Ophelia is not enabled." });
      }

      const account = await ctx.prisma.financialAccount.findFirst({
        where: { id: input.id, ...visibleAccountsWhere(ctx.userId, ctx.householdId) },
      });
      if (!account) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
      }

      const recentTxns = await ctx.prisma.transaction.findMany({
        where: {
          accountId: input.id,
          ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
        },
        orderBy: { date: "desc" },
        take: 20,
        select: { description: true, displayName: true, amount: true, type: true, date: true },
      });

      const recurringRules = await ctx.prisma.recurringRule.findMany({
        where: { accountId: input.id },
        take: 10,
        select: { description: true, amount: true, frequency: true },
      });

      const txnSummary = recentTxns.map((t) =>
        `${t.displayName || t.description} | ${t.amount / 100} ${account.currency} | ${t.type}`
      ).join("\n");

      const ruleSummary = recurringRules.map((r) =>
        `${r.description} | ${r.amount / 100} ${account.currency} | ${r.frequency}`
      ).join("\n");

      const userMessage = [
        `Account: ${account.name}`,
        `Type: ${account.type}`,
        `Institution: ${account.institution ?? "unknown"}`,
        `Currency: ${account.currency}`,
        `Balance: ${account.balance / 100}`,
        `\nRecent transactions:\n${txnSummary || "(none)"}`,
        recurringRules.length > 0 ? `\nRecurring rules:\n${ruleSummary}` : "",
      ].join("\n");

      const raw = await chatCompletion({
        systemPrompt: `You are a personal finance assistant. Do NOT think or reason — respond with JSON only, no explanation. Given an account's details and recent transactions, write a very brief description (1 short sentence, maximum 120 characters) of what this account is used for. Also suggest up to 3 useful external links (e.g. the bank's login page, mobile app, or customer service). Respond with ONLY this JSON: { "description": "...", "suggestedLinks": [{ "label": "...", "url": "..." }] }`,
        userMessage,
        maxTokens: 2048,
      });

      if (!raw) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI did not return a response." });
      }

      // Strip <think>...</think> reasoning blocks before parsing (greedy to handle unclosed tags)
      const cleaned = raw.replace(/<think>[\s\S]*<\/think>/gi, "").trim();
      type DescResult = { description: string; suggestedLinks: Array<{ label: string; url: string }> };
      let parsed = extractJSON<DescResult>(cleaned || raw);
      // Fallback: try extracting from original if cleaned version failed
      if (!parsed?.description && cleaned !== raw) {
        parsed = extractJSON<DescResult>(raw);
      }
      if (!parsed || !parsed.description) {
        console.error("[Ophelia] generateDescription — failed to parse response:", raw.slice(0, 500));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not parse AI response." });
      }

      return {
        description: parsed.description.slice(0, 120),
        suggestedLinks: Array.isArray(parsed.suggestedLinks) ? parsed.suggestedLinks.slice(0, 3) : [],
      };
    }),
});
