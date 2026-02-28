import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";
import { visibleAccountsWhere } from "@/lib/privacy";
import { extractDisplayName } from "@/lib/recurring";

const parsedTransactionSchema = z.object({
  date: z.coerce.date(),
  description: z.string(),
  amount: z.number().int(), // cents
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  externalId: z.string().optional(),
});

export const importRouter = router({
  /** Check for duplicates against existing transactions */
  checkDuplicates: householdProcedure
    .input(
      z.object({
        accountId: z.string(),
        transactions: z.array(parsedTransactionSchema),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify account access
      const account = await ctx.prisma.financialAccount.findFirst({
        where: {
          id: input.accountId,
          ...visibleAccountsWhere(ctx.userId, ctx.householdId),
        },
      });

      if (!account) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
      }

      if (input.transactions.length === 0) {
        return { duplicates: [], newTransactions: input.transactions };
      }

      // Get date range from imported transactions
      const dates = input.transactions.map((t) => t.date);
      const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

      // Extend range by 1 day for fuzzy matching
      minDate.setDate(minDate.getDate() - 1);
      maxDate.setDate(maxDate.getDate() + 1);

      // Fetch existing transactions in the date range
      const existing = await ctx.prisma.transaction.findMany({
        where: {
          accountId: input.accountId,
          date: { gte: minDate, lte: maxDate },
        },
        select: { id: true, date: true, amount: true, description: true, externalId: true },
      });

      const duplicates: number[] = [];
      const newTransactions: typeof input.transactions = [];

      for (let i = 0; i < input.transactions.length; i++) {
        const imported = input.transactions[i];
        const isDuplicate = existing.some((ex) => {
          // Exact externalId match
          if (imported.externalId && ex.externalId === imported.externalId) return true;

          // Same amount + same date + similar description
          const sameAmount = ex.amount === imported.amount;
          const sameDate =
            Math.abs(ex.date.getTime() - imported.date.getTime()) < 86400000; // 1 day
          const similarDesc =
            ex.description.toLowerCase().includes(imported.description.toLowerCase().slice(0, 20)) ||
            imported.description.toLowerCase().includes(ex.description.toLowerCase().slice(0, 20));

          return sameAmount && sameDate && similarDesc;
        });

        if (isDuplicate) {
          duplicates.push(i);
        } else {
          newTransactions.push(imported);
        }
      }

      return { duplicates, newTransactions };
    }),

  /** Commit imported transactions to the database */
  commit: householdProcedure
    .input(
      z.object({
        accountId: z.string(),
        fileName: z.string(),
        format: z.enum(["CSV", "MT940"]),
        transactions: z.array(
          z.object({
            date: z.coerce.date(),
            description: z.string(),
            displayName: z.string().optional(),
            amount: z.number().int(),
            type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
            visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
            categoryId: z.string().optional(),
            tagIds: z.array(z.string()).default([]),
            externalId: z.string().optional(),
          })
        ),
        profileId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify account access
      const account = await ctx.prisma.financialAccount.findFirst({
        where: {
          id: input.accountId,
          ...visibleAccountsWhere(ctx.userId, ctx.householdId),
        },
      });

      if (!account) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
      }

      // Create import batch and transactions in a single db transaction
      const result = await ctx.prisma.$transaction(async (tx) => {
        const batch = await tx.importBatch.create({
          data: {
            fileName: input.fileName,
            format: input.format,
            status: "PROCESSING",
            totalRows: input.transactions.length,
            userId: ctx.userId,
            accountId: input.accountId,
            profileId: input.profileId,
          },
        });

        let importedRows = 0;
        let balanceChange = 0;

        for (const txData of input.transactions) {
          const { tagIds, displayName: clientDisplayName, ...transactionData } = txData;

          const created = await tx.transaction.create({
            data: {
              ...transactionData,
              displayName: clientDisplayName || extractDisplayName(transactionData.description),
              originalDescription: transactionData.description,
              accountId: input.accountId,
              userId: ctx.userId,
              importBatchId: batch.id,
              tags: tagIds.length > 0
                ? { create: tagIds.map((tagId) => ({ tagId })) }
                : undefined,
            },
          });

          balanceChange += created.amount;
          importedRows++;
        }

        // Update account balance
        await tx.financialAccount.update({
          where: { id: input.accountId },
          data: { balance: { increment: balanceChange } },
        });

        // Finalize batch
        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status: "COMPLETED",
            importedRows,
          },
        });

        return { batchId: batch.id, importedRows };
      });

      return result;
    }),

  /** Save or update an import profile */
  saveProfile: householdProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        accountId: z.string(),
        format: z.enum(["CSV", "MT940"]),
        columnMapping: z.record(z.string(), z.string()),
        dateFormat: z.string().default("dd/MM/yyyy"),
        delimiter: z.string().default(","),
        skipRows: z.number().int().min(0).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.importProfile.create({
        data: input,
      });
    }),

  listProfiles: householdProcedure
    .input(z.object({ accountId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.importProfile.findMany({
        where: {
          ...(input.accountId && { accountId: input.accountId }),
          account: visibleAccountsWhere(ctx.userId, ctx.householdId),
        },
        orderBy: { createdAt: "desc" },
        include: {
          account: { select: { id: true, name: true } },
        },
      });
    }),
});
