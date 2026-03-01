import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";
import { visibleAccountsWhere } from "@/lib/privacy";
import { extractDisplayName } from "@/lib/recurring";
import { resolveDuplicates } from "@/lib/ophelia/resolveDuplicates";
import { isOpheliaEnabled } from "@/lib/ophelia";
import { categorizeTransactionBatch } from "@/lib/ophelia/categorize-batch";

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
        select: { id: true, date: true, amount: true, description: true, displayName: true, externalId: true },
      });

      // Pass 1 — classify each imported transaction:
      //   "definite"  → exact externalId match OR same amount + date + similar description
      //   "weakFuzzy" → same amount + date but different description (send to Ophelia)
      //   otherwise   → not a duplicate

      type ExistingTx = (typeof existing)[number];

      const definiteIndices: number[] = [];
      const weakFuzzyCandidates: { importIdx: number; existingTx: ExistingTx }[] = [];

      for (let i = 0; i < input.transactions.length; i++) {
        const imported = input.transactions[i];
        let isDefinite = false;
        let weakMatch: ExistingTx | null = null;

        for (const ex of existing) {
          // Exact by externalId
          if (imported.externalId && ex.externalId && imported.externalId === ex.externalId) {
            isDefinite = true;
            break;
          }

          const sameAmount = ex.amount === imported.amount;
          const sameDate =
            Math.abs(ex.date.getTime() - imported.date.getTime()) < 86400000; // 1 day
          if (!sameAmount || !sameDate) continue;

          // Check description similarity
          const similarDesc =
            ex.description.toLowerCase().includes(imported.description.toLowerCase().slice(0, 20)) ||
            imported.description.toLowerCase().includes(ex.description.toLowerCase().slice(0, 20));

          if (similarDesc) {
            isDefinite = true;
            break;
          }

          // Same amount + date but different description → weak fuzzy candidate
          if (!weakMatch) weakMatch = ex;
        }

        if (isDefinite) {
          definiteIndices.push(i);
        } else if (weakMatch) {
          weakFuzzyCandidates.push({ importIdx: i, existingTx: weakMatch });
        }
      }

      // Pass 2 — resolve weak fuzzy candidates with Ophelia AI (fast: usually <10 pairs)
      type FuzzyResult = {
        index: number;
        isDuplicate: boolean | null; // null = AI unavailable, user decides
        confidence: number;
        reasoning: string;
        matchedDescription: string;
      };

      let fuzzy: FuzzyResult[] = [];

      if (weakFuzzyCandidates.length > 0) {
        if (isOpheliaEnabled()) {
          const pairs = weakFuzzyCandidates.map(({ importIdx, existingTx: ex }) => ({
            index: importIdx,
            newTransaction: {
              date: input.transactions[importIdx].date.toISOString().slice(0, 10),
              description: input.transactions[importIdx].description,
              amount: input.transactions[importIdx].amount,
            },
            existingTransaction: {
              date: ex.date.toISOString().slice(0, 10),
              description: ex.description,
              amount: ex.amount,
              displayName: ex.displayName ?? ex.description,
            },
          }));

          const resolutions = await resolveDuplicates(pairs);

          if (resolutions) {
            fuzzy = resolutions.map((r) => ({
              index: r.pairIndex,
              isDuplicate: r.isDuplicate,
              confidence: r.confidence,
              reasoning: r.reasoning,
              matchedDescription:
                pairs.find((p) => p.index === r.pairIndex)?.existingTransaction.displayName ?? "",
            }));
          } else {
            // AI call failed — surface as undecided so user can review manually
            fuzzy = weakFuzzyCandidates.map(({ importIdx, existingTx: ex }) => ({
              index: importIdx,
              isDuplicate: null,
              confidence: 0,
              reasoning: "Could not check automatically — please review",
              matchedDescription: ex.displayName ?? ex.description,
            }));
          }
        } else {
          // Ophelia disabled — surface as undecided
          fuzzy = weakFuzzyCandidates.map(({ importIdx, existingTx: ex }) => ({
            index: importIdx,
            isDuplicate: null,
            confidence: 0,
            reasoning: "Potential duplicate — please review",
            matchedDescription: ex.displayName ?? ex.description,
          }));
        }
      }

      return { duplicates: definiteIndices, fuzzy };
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

      // Fire-and-forget: kick off Ophelia for newly imported transactions.
      // Not awaited — doesn't slow down the commit response.
      if (isOpheliaEnabled()) {
        categorizeTransactionBatch(ctx.prisma, ctx.householdId, 50).catch((err) =>
          console.error("[Ophelia] Post-import categorization error:", err)
        );
      }

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
