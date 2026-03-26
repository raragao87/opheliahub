import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";
import { visibleAccountsWhere, visibleTransactionsWhere } from "@/lib/privacy";
import { extractDisplayName } from "@/lib/recurring";
import { computeEffectiveCategoryId } from "@/lib/effective-category";
import { resolveDuplicates } from "@/lib/ophelia/resolveDuplicates";
import { isOpheliaEnabled } from "@/lib/ophelia";
import { categorizeTransactionBatch } from "@/lib/ophelia/categorize-batch";
import { checkPostImportDuplicates } from "@/lib/ophelia/check-post-import-duplicates";

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
          ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
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
            visibility: z.enum(["SHARED", "PERSONAL"]).optional(),
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
          const { tagIds, displayName: clientDisplayName, visibility: _vis, ...transactionData } = txData;

          const created = await tx.transaction.create({
            data: {
              ...transactionData,
              visibility: account.ownership,
              displayName: clientDisplayName || extractDisplayName(transactionData.description),
              originalDescription: transactionData.description,
              accountId: input.accountId,
              userId: ctx.userId,
              importBatchId: batch.id,
              effectiveCategoryId: computeEffectiveCategoryId(transactionData.categoryId, null),
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

        // Background duplicate check for transactions that slipped through
        checkPostImportDuplicates(ctx.prisma, ctx.userId, ctx.householdId, input.accountId, result.batchId)
          .catch((err) => console.error("[Ophelia] Post-import duplicate check error:", err));
      }

      return result;
    }),

  /** Save or update an import profile (upsert per account+format) */
  saveProfile: householdProcedure
    .input(
      z.object({
        accountId: z.string(),
        format: z.enum(["CSV", "MT940"]),
        columnMapping: z.record(z.string(), z.string()),
        dateFormat: z.string().default("dd/MM/yyyy"),
        delimiter: z.string().default(","),
        skipRows: z.number().int().min(0).default(0),
        amountMode: z.enum(["single", "split"]).default("single"),
        invertAmounts: z.boolean().default(false),
        columnFilters: z.record(z.string(), z.array(z.string())).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { accountId, format, columnFilters, ...rest } = input;
      return ctx.prisma.importProfile.upsert({
        where: {
          accountId_format: { accountId, format },
        },
        create: {
          name: `${format} profile`,
          accountId,
          format,
          ...rest,
          columnFilters: columnFilters ?? undefined,
        },
        update: {
          ...rest,
          columnFilters: columnFilters ?? undefined,
        },
      });
    }),

  /** Get the saved profile for an account + format */
  getProfile: householdProcedure
    .input(z.object({ accountId: z.string(), format: z.enum(["CSV", "MT940"]) }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.importProfile.findUnique({
        where: {
          accountId_format: { accountId: input.accountId, format: input.format },
        },
      });
    }),

  /** Get import context for smart duplicate detection */
  getAccountImportContext: householdProcedure
    .input(
      z.object({
        accountId: z.string(),
        importMinDate: z.coerce.date().optional(),
        importMaxDate: z.coerce.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const lastTransaction = await ctx.prisma.transaction.findFirst({
        where: {
          accountId: input.accountId,
          ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
          isInitialBalance: false,
        },
        orderBy: { date: "desc" },
        select: { date: true },
      });

      const lastBatch = await ctx.prisma.importBatch.findFirst({
        where: { accountId: input.accountId, status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, importedRows: true, fileName: true },
      });

      // If we have a date range, get existing transaction counts per date for overlap detection
      let existingCountsByDate: { date: Date; _count: number }[] = [];
      let existingInOverlap: { date: Date; amount: number; description: string; id: string }[] = [];

      if (input.importMinDate && input.importMaxDate) {
        existingCountsByDate = (await ctx.prisma.transaction.groupBy({
          by: ["date"],
          where: {
            accountId: input.accountId,
            date: { gte: input.importMinDate, lte: input.importMaxDate },
            ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
            isInitialBalance: false,
          },
          _count: true,
        })).map((g) => ({ date: g.date, _count: g._count }));

        // Fetch individual transactions in overlap range for amount matching
        existingInOverlap = await ctx.prisma.transaction.findMany({
          where: {
            accountId: input.accountId,
            date: { gte: input.importMinDate, lte: input.importMaxDate },
            ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
            isInitialBalance: false,
          },
          select: { id: true, date: true, amount: true, description: true },
          orderBy: { date: "asc" },
        });
      }

      return {
        lastTransactionDate: lastTransaction?.date ?? null,
        lastImportDate: lastBatch?.createdAt ?? null,
        lastImportFileName: lastBatch?.fileName ?? null,
        lastImportRowCount: lastBatch?.importedRows ?? 0,
        existingCountsByDate,
        existingInOverlap,
      };
    }),

  /** Dismiss duplicate alerts */
  dismissDuplicateAlerts: householdProcedure
    .input(z.object({ alertIds: z.array(z.string()).optional(), accountId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const where: Record<string, unknown> = { userId: ctx.userId, status: "pending" };
      if (input.alertIds) where.id = { in: input.alertIds };
      if (input.accountId) where.accountId = input.accountId;
      return ctx.prisma.duplicateAlert.updateMany({
        where,
        data: { status: "dismissed" },
      });
    }),

  /** Get pending duplicate alerts for the current user */
  getDuplicateAlerts: householdProcedure
    .query(async ({ ctx }) => {
      return ctx.prisma.duplicateAlert.findMany({
        where: { userId: ctx.userId, status: "pending" },
        orderBy: { createdAt: "desc" },
        take: 50,
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
