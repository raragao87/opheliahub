import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { router, householdProcedure } from "../init";
import { visibleTransactionsWhere, visibleAccountsWhere } from "@/lib/privacy";
import { SPENDING_ACCOUNT_TYPES, ACCOUNT_TYPE_META } from "@/lib/account-types";
import { extractDisplayName } from "@/lib/recurring";
import { computeEffectiveCategoryId } from "@/lib/effective-category";

async function getTransferCategoryId(
  prisma: PrismaClient,
  householdId: string,
  budgetScope: "SHARED" | "PERSONAL",
  matched: boolean,
): Promise<string | null> {
  const name = matched ? "Matched" : "Unmatched";
  const category = await prisma.category.findFirst({
    where: {
      householdId,
      type: "TRANSFER",
      name,
      parentId: { not: null },
      budgetScope,
    },
    select: { id: true },
  });
  return category?.id ?? null;
}

async function validateCategoryAccountMatch(
  prisma: PrismaClient,
  categoryId: string | null | undefined,
  accountOwnership: "SHARED" | "PERSONAL",
) {
  if (!categoryId) return;
  const cat = await prisma.category.findFirst({
    where: { id: categoryId },
    select: { budgetScope: true },
  });
  if (cat && cat.budgetScope !== accountOwnership) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Category belongs to ${cat.budgetScope} scope but account is ${accountOwnership}.`,
    });
  }
}

export const transactionRouter = router({
  list: householdProcedure
    .input(
      z.object({
        accountId: z.string().optional(),
        accountIds: z.array(z.string()).optional(),
        categoryId: z.string().optional(),
        categoryIds: z.array(z.string()).optional(),
        type: z.enum(["INCOME", "EXPENSE", "FUND", "TRANSFER", "INVESTMENT"]).optional(),
        transferType: z.enum(["INTERNAL", "EXTERNAL"]).optional(),
        budgetScope: z.enum(["SHARED", "PERSONAL"]).optional(),
        tagId: z.string().optional(),
        tagIds: z.array(z.string()).optional(),
        uncategorized: z.boolean().optional(),
        opheliaUnconfirmed: z.boolean().optional(),
        noTags: z.boolean().optional(),
        hasNotes: z.boolean().optional(),
        mentionedMe: z.boolean().optional(),
        // Parse as local (Amsterdam) start/end of day so that transactions
        // stored at local midnight are included correctly (e.g. Jan 1 00:00 Amsterdam
        // is stored as Dec 31 23:00 UTC and must be included in January).
        dateFrom: z.coerce
          .date()
          .transform((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()))
          .optional(),
        dateTo: z.coerce
          .date()
          .transform((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999))
          .optional(),
        // Accrual date range: filters by effective budget date (accrualDate ?? date).
        // Used by the tracker drill-down to show transactions that count toward a budget month.
        accrualDateFrom: z.coerce
          .date()
          .transform((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()))
          .optional(),
        accrualDateTo: z.coerce
          .date()
          .transform((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999))
          .optional(),
        search: z.string().optional(),
        amountMin: z.number().int().optional(),
        amountMax: z.number().int().optional(),
        liquidOnly: z.boolean().optional(),
        excludeTransfers: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.TransactionWhereInput = {
        AND: [
          // Privacy filter
          visibleTransactionsWhere(ctx.userId, ctx.householdId),

          // Simple filters (no OR/AND — safe to merge into one object)
          {
            ...(input.accountIds?.length
              ? { accountId: { in: input.accountIds } }
              : input.accountId
                ? { accountId: input.accountId }
                : {}),
            ...(input.transferType
              ? { type: "TRANSFER" as const }
              : input.type
                ? { type: input.type }
                : {}),
            ...(input.noTags
              ? { tags: { none: {} } }
              : input.tagIds?.length
                ? { tags: { some: { tagId: { in: input.tagIds } } } }
                : input.tagId
                  ? { tags: { some: { tagId: input.tagId } } }
                  : {}),
            ...(input.hasNotes && { notes: { not: null } }),
            ...(input.mentionedMe && { notes: { contains: `(${ctx.userId})` } }),
            ...(input.amountMin !== undefined || input.amountMax !== undefined
              ? {
                  amount: {
                    ...(input.amountMin !== undefined && { gte: input.amountMin }),
                    ...(input.amountMax !== undefined && { lte: input.amountMax }),
                  },
                }
              : {}),
            ...(input.transferType === "EXTERNAL" && {
              linkedTransactionId: null,
              linkedBy: { is: null },
            }),
          },

          // Category filter (separate AND entry)
          ...(input.opheliaUnconfirmed
            ? [{ categoryId: { equals: null },
                 opheliaCategoryId: { not: null }, opheliaCategory: { isNot: null },
                 type: { in: ["INCOME", "EXPENSE", "FUND"] as ("INCOME" | "EXPENSE" | "FUND")[] } }]
            : input.uncategorized
              ? [{ effectiveCategoryId: { equals: null },
                   type: { notIn: ["TRANSFER"] as ("TRANSFER")[] } }]
              : input.categoryIds?.length
                ? [{ effectiveCategoryId: { in: input.categoryIds } }]
                : input.categoryId
                  ? [{ effectiveCategoryId: input.categoryId }]
                  : []),

          // Date filter (uses OR — separate AND entry)
          ...(input.dateFrom || input.dateTo
            ? [{
                OR: [
                  { isInitialBalance: true },
                  { date: {
                    ...(input.dateFrom && { gte: input.dateFrom }),
                    ...(input.dateTo && { lte: input.dateTo }),
                  } },
                ],
              }]
            : []),

          // Search filter (uses OR — separate AND entry)
          ...(input.search
            ? [{
                OR: [
                  { description: { contains: input.search, mode: "insensitive" as const } },
                  { displayName: { contains: input.search, mode: "insensitive" as const } },
                ],
              }]
            : []),

          // Internal transfer filter (uses OR — already separate)
          ...(input.transferType === "INTERNAL"
            ? [{
                OR: [
                  { linkedTransactionId: { not: null } },
                  { linkedBy: { isNot: null } },
                ],
              }]
            : []),

          // Liquid-only
          ...(input.liquidOnly
            ? [{ account: { type: { in: SPENDING_ACCOUNT_TYPES } } }]
            : []),

          // Exclude transfers
          ...(input.excludeTransfers
            ? [{ type: { not: "TRANSFER" as const } }]
            : []),

          // Ownership filter (separate AND to avoid account key collision)
          ...(input.budgetScope
            ? [{ account: { ownership: input.budgetScope } }]
            : []),

          // Accrual date filter (uses OR — already separate)
          ...(input.accrualDateFrom || input.accrualDateTo
            ? [{
                OR: [
                  { isInitialBalance: true },
                  {
                    accrualDate: {
                      ...(input.accrualDateFrom && { gte: input.accrualDateFrom }),
                      ...(input.accrualDateTo && { lte: input.accrualDateTo }),
                    },
                  },
                  {
                    accrualDate: null,
                    date: {
                      ...(input.accrualDateFrom && { gte: input.accrualDateFrom }),
                      ...(input.accrualDateTo && { lte: input.accrualDateTo }),
                    },
                  },
                ],
              }]
            : []),
        ],
      };

      const transactions = await ctx.prisma.transaction.findMany({
        where,
        orderBy: [{ isInitialBalance: "asc" }, { date: "desc" }, { id: "asc" }],
        take: input.limit + 1,
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
        include: {
          account: { select: { id: true, name: true, type: true, institution: true, ownership: true } },
          category: { select: { id: true, name: true, icon: true, color: true } },
          opheliaCategory: { select: { id: true, name: true } },
          investmentDetail: {
            include: { investmentAsset: { select: { id: true, ticker: true, name: true, type: true } } },
          },
          tags: {
            include: {
              tag: { select: { id: true, name: true, color: true } },
            },
          },
          user: { select: { id: true, name: true, image: true } },
          linkedTransaction: { include: { account: { select: { id: true, name: true } } } },
          linkedBy: { include: { account: { select: { id: true, name: true } } } },
        },
      });

      let nextCursor: string | undefined;
      if (transactions.length > input.limit) {
        const next = transactions.pop();
        nextCursor = next?.id;
      }

      return { transactions, nextCursor };
    }),

  getById: householdProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const transaction = await ctx.prisma.transaction.findFirst({
        where: {
          id: input.id,
          ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
        },
        include: {
          account: true,
          category: true,
          opheliaCategory: { select: { id: true, name: true } },
          investmentDetail: {
            include: { investmentAsset: { select: { id: true, ticker: true, name: true, type: true } } },
          },
          tags: { include: { tag: true } },
          user: { select: { id: true, name: true, image: true } },
          linkedTransaction: { include: { account: true } },
          linkedBy: { include: { account: true } },
        },
      });

      if (!transaction) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return transaction;
    }),

  create: householdProcedure
    .input(
      z.object({
        amount: z.number().int(),
        type: z.enum(["INCOME", "EXPENSE", "FUND", "TRANSFER", "INVESTMENT"]),
        description: z.string().min(1).max(500),
        date: z.coerce.date(),
        accountId: z.string(),
        toAccountId: z.string().optional(),
        categoryId: z.string().optional(),
        investmentAssetId: z.string().optional(),
        quantity: z.number().optional(),
        unitPrice: z.number().int().optional(),
        notes: z.string().optional(),
        tagIds: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the user has access to the source account
      const account = await ctx.prisma.financialAccount.findFirst({
        where: {
          id: input.accountId,
          ...visibleAccountsWhere(ctx.userId, ctx.householdId),
        },
      });

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found or not accessible.",
        });
      }

      await validateCategoryAccountMatch(ctx.prisma, input.categoryId, account.ownership as "SHARED" | "PERSONAL");

      // ── TRANSFER: dual-sided creation ──────────────────────────────
      if (input.type === "TRANSFER") {
        if (!input.toAccountId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Target account is required for transfers.",
          });
        }

        if (input.toAccountId === input.accountId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot transfer to the same account.",
          });
        }

        // Verify access to target account
        const toAccount = await ctx.prisma.financialAccount.findFirst({
          where: {
            id: input.toAccountId,
            ...visibleAccountsWhere(ctx.userId, ctx.householdId),
          },
        });

        if (!toAccount) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Target account not found or not accessible.",
          });
        }

        const absAmount = Math.abs(input.amount);

        const sourceAccount = await ctx.prisma.financialAccount.findFirst({
          where: { id: input.accountId },
          select: { ownership: true },
        });
        const transferVisibility = (sourceAccount?.ownership ?? "SHARED") as "SHARED" | "PERSONAL";
        const matchedCatId = await getTransferCategoryId(
          ctx.prisma, ctx.householdId, transferVisibility, true,
        );

        return ctx.prisma.$transaction(async (tx) => {
          // 1. Create inflow (positive) on target account
          const inflow = await tx.transaction.create({
            data: {
              amount: absAmount,
              type: "TRANSFER",
              description: input.description,
              displayName: extractDisplayName(input.description),
              originalDescription: input.description,
              date: input.date,
              accountId: input.toAccountId!,
              userId: ctx.userId,
              notes: input.notes,
              categoryId: matchedCatId,
              effectiveCategoryId: matchedCatId,
            },
          });

          // 2. Create outflow (negative) on source account, linked to inflow
          const outflow = await tx.transaction.create({
            data: {
              amount: -absAmount,
              type: "TRANSFER",
              description: input.description,
              displayName: extractDisplayName(input.description),
              originalDescription: input.description,
              date: input.date,
              accountId: input.accountId,
              userId: ctx.userId,
              notes: input.notes,
              linkedTransactionId: inflow.id,
              categoryId: matchedCatId,
              effectiveCategoryId: matchedCatId,
            },
            include: {
              account: { select: { id: true, name: true } },
              category: { select: { id: true, name: true, icon: true } },
              tags: { include: { tag: true } },
            },
          });

          // 3. Update both account balances
          await tx.financialAccount.update({
            where: { id: input.accountId },
            data: { balance: { decrement: absAmount } },
          });
          await tx.financialAccount.update({
            where: { id: input.toAccountId! },
            data: { balance: { increment: absAmount } },
          });

          return outflow;
        });
      }

      // ── Non-transfer: existing logic ────────────────────────────────
      // Auto-type INVESTMENT for investment accounts
      const isInvestmentAccount = ACCOUNT_TYPE_META[account.type]?.sidebarGroup === "INVESTMENT";
      if (isInvestmentAccount) {
        input.type = "INVESTMENT";
      }

      const {
        tagIds,
        toAccountId: _toAccountId,
        investmentAssetId,
        quantity,
        unitPrice,
        ...data
      } = input;

      const transaction = await ctx.prisma.$transaction(async (tx) => {
        const txn = await tx.transaction.create({
          data: {
            ...data,
            userId: ctx.userId,
            displayName: extractDisplayName(data.description),
            originalDescription: data.description,
            effectiveCategoryId: computeEffectiveCategoryId(data.categoryId, null),
            tags: tagIds.length > 0
              ? { create: tagIds.map((tagId) => ({ tagId })) }
              : undefined,
            ...(investmentAssetId && quantity != null && unitPrice != null && {
              investmentDetail: {
                create: { investmentAssetId, quantity, unitPrice },
              },
            }),
          },
          include: {
            account: { select: { id: true, name: true } },
            category: { select: { id: true, name: true, icon: true } },
            investmentDetail: {
              include: { investmentAsset: { select: { id: true, ticker: true, name: true, type: true } } },
            },
            tags: { include: { tag: true } },
          },
        });

        await tx.financialAccount.update({
          where: { id: input.accountId },
          data: { balance: { increment: input.amount } },
        });

        return txn;
      });

      return transaction;
    }),

  update: householdProcedure
    .input(
      z.object({
        id: z.string(),
        amount: z.number().int().optional(),
        type: z.enum(["INCOME", "EXPENSE", "FUND", "TRANSFER", "INVESTMENT"]).optional(),
        description: z.string().min(1).max(500).optional(),
        displayName: z.string().max(100).nullable().optional(),
        date: z.coerce.date().optional(),
        accrualDate: z.coerce.date().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        investmentAssetId: z.string().nullable().optional(),
        quantity: z.number().nullable().optional(),
        unitPrice: z.number().int().nullable().optional(),
        notes: z.string().nullable().optional(),
        tagIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        investmentAssetId: inputAssetId,
        quantity: inputQuantity,
        unitPrice: inputUnitPrice,
        ...restInput
      } = input;

      const existing = await ctx.prisma.transaction.findFirst({
        where: {
          id: input.id,
          ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
        },
        include: {
          linkedTransaction: true,
          linkedBy: true,
          account: { select: { ownership: true } },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transaction not found or you don't have permission.",
        });
      }

      await validateCategoryAccountMatch(ctx.prisma, restInput.categoryId, existing.account.ownership as "SHARED" | "PERSONAL");

      // ── TRANSFER: cascading update ──────────────────────────────────
      if (existing.type === "TRANSFER") {
        // Disallow type changes to/from TRANSFER
        if (input.type !== undefined && input.type !== "TRANSFER") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot change the type of a transfer. Delete and recreate instead.",
          });
        }

        const partner = existing.linkedTransaction ?? existing.linkedBy;

        if (partner) {
          return ctx.prisma.$transaction(async (tx) => {
            const { id, tagIds, type: _type, ...data } = restInput;

            // Compute balance diffs for both sides
            const isOutflow = existing.amount < 0;
            const oldAbs = Math.abs(existing.amount);
            const newAbs = data.amount !== undefined ? Math.abs(data.amount) : oldAbs;

            // Auto-recompute displayName if description changed but displayName not explicitly set
            if (data.description !== undefined && data.displayName === undefined) {
              data.displayName = extractDisplayName(data.description);
            }

            // Update this transaction
            const updateData: Record<string, unknown> = {};
            if (data.description !== undefined) updateData.description = data.description;
            if (data.displayName !== undefined) updateData.displayName = data.displayName;
            if (data.date !== undefined) updateData.date = data.date;
            if (data.accrualDate !== undefined) updateData.accrualDate = data.accrualDate;
            if (data.notes !== undefined) updateData.notes = data.notes;
            if (data.amount !== undefined) {
              updateData.amount = isOutflow ? -newAbs : newAbs;
            }

            // Mirror to partner (same fields, negated amount)
            const partnerData: Record<string, unknown> = {};
            if (data.description !== undefined) partnerData.description = data.description;
            if (data.displayName !== undefined) partnerData.displayName = data.displayName;
            if (data.date !== undefined) partnerData.date = data.date;
            if (data.accrualDate !== undefined) partnerData.accrualDate = data.accrualDate;
            if (data.notes !== undefined) partnerData.notes = data.notes;
            if (data.amount !== undefined) {
              partnerData.amount = isOutflow ? newAbs : -newAbs;
            }

            await tx.transaction.update({ where: { id }, data: updateData });
            await tx.transaction.update({ where: { id: partner.id }, data: partnerData });

            // Update tags on this side only (if provided)
            if (tagIds !== undefined) {
              await tx.transactionTag.deleteMany({ where: { transactionId: id } });
              if (tagIds.length > 0) {
                await tx.transactionTag.createMany({
                  data: tagIds.map((tagId) => ({ transactionId: id, tagId })),
                });
              }
            }

            // Adjust balances if amount changed
            if (data.amount !== undefined && newAbs !== oldAbs) {
              const diff = newAbs - oldAbs;
              // Source account (outflow side): decrement more
              // Target account (inflow side): increment more
              const outflowId = isOutflow ? existing.accountId : partner.accountId;
              const inflowId = isOutflow ? partner.accountId : existing.accountId;

              await tx.financialAccount.update({
                where: { id: outflowId },
                data: { balance: { decrement: diff } },
              });
              await tx.financialAccount.update({
                where: { id: inflowId },
                data: { balance: { increment: diff } },
              });
            }

            return tx.transaction.findFirst({
              where: { id },
              include: {
                account: { select: { id: true, name: true } },
                category: { select: { id: true, name: true, icon: true } },
                tags: { include: { tag: true } },
              },
            });
          });
        }
      }

      // Disallow changing non-transfer to TRANSFER
      if (input.type === "TRANSFER" && existing.type !== "TRANSFER") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot change type to TRANSFER. Delete and create a new transfer instead.",
        });
      }

      // ── Non-transfer: existing logic ────────────────────────────────
      const { id, tagIds, ...data } = restInput;

      // Auto-derive transaction type from category type
      if (data.categoryId !== undefined && data.categoryId !== null) {
        const targetCategory = await ctx.prisma.category.findFirst({
          where: { id: data.categoryId },
          select: { type: true },
        });
        if (targetCategory) {
          const typeMap: Record<string, typeof data.type> = {
            FUND: "FUND",
            INVESTMENT: "INVESTMENT",
            INCOME: "INCOME",
            EXPENSE: "EXPENSE",
          };
          if (typeMap[targetCategory.type]) {
            data.type = typeMap[targetCategory.type];
          }
        }
      }

      // Auto-recompute displayName if description changed but displayName not explicitly set
      if (data.description !== undefined && data.displayName === undefined) {
        data.displayName = extractDisplayName(data.description);
      }

      // If amount changed, adjust balance
      if (data.amount !== undefined && data.amount !== existing.amount) {
        const diff = data.amount - existing.amount;
        await ctx.prisma.financialAccount.update({
          where: { id: existing.accountId },
          data: { balance: { increment: diff } },
        });
      }

      // Update tags if provided
      if (tagIds !== undefined) {
        await ctx.prisma.transactionTag.deleteMany({
          where: { transactionId: id },
        });
        if (tagIds.length > 0) {
          await ctx.prisma.transactionTag.createMany({
            data: tagIds.map((tagId) => ({ transactionId: id, tagId })),
          });
        }
      }

      // ── Ophelia feedback capture ────────────────────────────────────
      // When a user sets/changes a category on a transaction that Ophelia
      // has already processed, record it as a training signal.
      if (input.categoryId !== undefined && existing.opheliaCategoryId) {
        // Look up both category names for the prompt
        const categoryIds = [
          existing.opheliaCategoryId,
          ...(input.categoryId ? [input.categoryId] : []),
        ];
        const cats = await ctx.prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        });
        const nameOf = (cid: string | null) =>
          cid ? (cats.find((c) => c.id === cid)?.name ?? null) : null;

        await ctx.prisma.opheliaFeedback.create({
          data: {
            householdId: ctx.householdId,
            userId: ctx.userId,
            transactionDescription: existing.description,
            opheliaCategoryId: existing.opheliaCategoryId,
            opheliaCategoryName: nameOf(existing.opheliaCategoryId),
            userCategoryId: input.categoryId,
            userCategoryName: nameOf(input.categoryId),
            opheliaDisplayName: existing.opheliaDisplayName,
            userDisplayName: input.displayName ?? null,
            opheliaConfidence: existing.opheliaConfidence,
            wasCorrection: input.categoryId !== existing.opheliaCategoryId,
          },
        });
      }

      // If categoryId changed, recompute effectiveCategoryId
      const updateData: Record<string, unknown> = { ...data };
      if (input.categoryId !== undefined) {
        updateData.effectiveCategoryId = computeEffectiveCategoryId(
          input.categoryId,
          existing.opheliaCategoryId,
        );
      }

      // Handle InvestmentDetail upsert/delete
      if (inputAssetId !== undefined) {
        if (inputAssetId && inputQuantity != null && inputUnitPrice != null) {
          await ctx.prisma.investmentDetail.upsert({
            where: { transactionId: id },
            update: { investmentAssetId: inputAssetId, quantity: inputQuantity, unitPrice: inputUnitPrice },
            create: { transactionId: id, investmentAssetId: inputAssetId, quantity: inputQuantity, unitPrice: inputUnitPrice },
          });
        } else if (inputAssetId) {
          // Partial update — only asset (and optionally qty/price) changed
          await ctx.prisma.investmentDetail.updateMany({
            where: { transactionId: id },
            data: {
              investmentAssetId: inputAssetId,
              ...(inputQuantity != null && { quantity: inputQuantity }),
              ...(inputUnitPrice != null && { unitPrice: inputUnitPrice }),
            },
          });
        } else if (inputAssetId === null) {
          await ctx.prisma.investmentDetail.deleteMany({ where: { transactionId: id } });
        }
      }

      return ctx.prisma.transaction.update({
        where: { id },
        data: updateData,
        include: {
          account: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, icon: true } },
          investmentDetail: {
            include: { investmentAsset: { select: { id: true, ticker: true, name: true, type: true } } },
          },
          tags: { include: { tag: true } },
        },
      });
    }),

  delete: householdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const transaction = await ctx.prisma.transaction.findFirst({
        where: {
          id: input.id,
          ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
        },
        include: {
          linkedTransaction: true,
          linkedBy: true,
        },
      });

      if (!transaction) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transaction not found or you don't have permission.",
        });
      }

      // ── TRANSFER: cascading delete ──────────────────────────────────
      if (transaction.type === "TRANSFER") {
        const partner = transaction.linkedTransaction ?? transaction.linkedBy;

        if (partner) {
          return ctx.prisma.$transaction(async (tx) => {
            // Nullify the FK to avoid constraint violation
            if (transaction.linkedTransactionId) {
              await tx.transaction.update({
                where: { id: transaction.id },
                data: { linkedTransactionId: null },
              });
            } else {
              // Partner holds the FK pointing to us
              await tx.transaction.update({
                where: { id: partner.id },
                data: { linkedTransactionId: null },
              });
            }

            // Soft-delete both transactions
            const now = new Date();
            await tx.transaction.update({ where: { id: transaction.id }, data: { deletedAt: now } });
            await tx.transaction.update({ where: { id: partner.id }, data: { deletedAt: now } });

            // Reverse balances on both accounts
            await tx.financialAccount.update({
              where: { id: transaction.accountId },
              data: { balance: { decrement: transaction.amount } },
            });
            await tx.financialAccount.update({
              where: { id: partner.accountId },
              data: { balance: { decrement: partner.amount } },
            });

            return transaction;
          });
        }
      }

      // ── Non-transfer: existing logic ────────────────────────────────
      // Reverse balance effect
      await ctx.prisma.financialAccount.update({
        where: { id: transaction.accountId },
        data: { balance: { decrement: transaction.amount } },
      });

      return ctx.prisma.transaction.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });
    }),

  // ── Bulk operations ──────────────────────────────────────────────────

  bulkUpdateCategory: householdProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(500),
        categoryId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const accessible = await ctx.prisma.transaction.findMany({
        where: {
          id: { in: input.ids },
          ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
        },
        select: { id: true, account: { select: { ownership: true } } },
      });
      const accessibleIds = accessible.map((t) => t.id);

      if (accessibleIds.length !== input.ids.length) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${input.ids.length - accessibleIds.length} transaction(s) not found or not accessible.`,
        });
      }

      if (input.categoryId) {
        const cat = await ctx.prisma.category.findFirst({
          where: { id: input.categoryId },
          select: { budgetScope: true },
        });
        if (cat) {
          const mismatch = accessible.find((t) => t.account.ownership !== cat.budgetScope);
          if (mismatch) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Category belongs to ${cat.budgetScope} scope but some transactions belong to ${mismatch.account.ownership} accounts.`,
            });
          }
        }
      }

      const data: {
        categoryId: string | null;
        effectiveCategoryId?: string | null;
        type?: "INCOME" | "EXPENSE" | "FUND" | "TRANSFER" | "INVESTMENT";
      } = {
        categoryId: input.categoryId,
      };

      if (input.categoryId) {
        const targetCategory = await ctx.prisma.category.findFirst({
          where: { id: input.categoryId },
          select: { type: true },
        });
        if (targetCategory) {
          const typeMap: Record<string, string> = {
            FUND: "FUND",
            INVESTMENT: "INVESTMENT",
            INCOME: "INCOME",
            EXPENSE: "EXPENSE",
          };
          if (typeMap[targetCategory.type]) {
            data.type = typeMap[targetCategory.type] as typeof data.type;
          }
        }
        data.effectiveCategoryId = input.categoryId;
      }

      await ctx.prisma.transaction.updateMany({
        where: { id: { in: accessibleIds } },
        data,
      });

      if (!input.categoryId) {
        await ctx.prisma.$executeRaw`
          UPDATE transactions
          SET "effectiveCategoryId" = "opheliaCategoryId"
          WHERE id = ANY(${accessibleIds})
        `;
      }

      await ctx.prisma.auditLog.create({
        data: {
          action: "transaction.bulk_update_category",
          entityType: "Transaction",
          entityId: accessibleIds.join(","),
          userId: ctx.userId,
          metadata: { categoryId: input.categoryId, count: accessibleIds.length },
        },
      });

      return { updated: accessibleIds.length };
    }),

  bulkAddTags: householdProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(500),
        tagIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const accessible = await ctx.prisma.transaction.findMany({
        where: {
          id: { in: input.ids },
          ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
        },
        select: { id: true, tags: { select: { tagId: true } } },
      });
      const accessibleIds = accessible.map((t) => t.id);

      if (accessibleIds.length !== input.ids.length) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${input.ids.length - accessibleIds.length} transaction(s) not found or not accessible.`,
        });
      }

      // Build inserts, skipping existing associations
      const inserts: { transactionId: string; tagId: string }[] = [];
      for (const txn of accessible) {
        const existing = new Set(txn.tags.map((t) => t.tagId));
        for (const tagId of input.tagIds) {
          if (!existing.has(tagId)) {
            inserts.push({ transactionId: txn.id, tagId });
          }
        }
      }

      if (inserts.length > 0) {
        await ctx.prisma.transactionTag.createMany({
          data: inserts,
          skipDuplicates: true,
        });
      }

      await ctx.prisma.auditLog.create({
        data: {
          action: "transaction.bulk_add_tags",
          entityType: "Transaction",
          entityId: accessibleIds.join(","),
          userId: ctx.userId,
          metadata: { tagIds: input.tagIds, count: accessibleIds.length },
        },
      });

      return { updated: accessibleIds.length };
    }),

  bulkRemoveTags: householdProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(500),
        tagIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const accessible = await ctx.prisma.transaction.findMany({
        where: {
          id: { in: input.ids },
          ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
        },
        select: { id: true },
      });
      const accessibleIds = accessible.map((t) => t.id);

      if (accessibleIds.length !== input.ids.length) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${input.ids.length - accessibleIds.length} transaction(s) not found or not accessible.`,
        });
      }

      await ctx.prisma.transactionTag.deleteMany({
        where: {
          transactionId: { in: accessibleIds },
          tagId: { in: input.tagIds },
        },
      });

      await ctx.prisma.auditLog.create({
        data: {
          action: "transaction.bulk_remove_tags",
          entityType: "Transaction",
          entityId: accessibleIds.join(","),
          userId: ctx.userId,
          metadata: { tagIds: input.tagIds, count: accessibleIds.length },
        },
      });

      return { updated: accessibleIds.length };
    }),

  /** Backfill displayName for transactions where it is null or still looks like raw bank data */
  backfillDisplayNames: householdProcedure
    .input(
      z.object({
        /** Re-extract all display names, even if already set */
        force: z.boolean().default(false),
      }).default({ force: false })
    )
    .mutation(async ({ ctx, input }) => {
      const where: Prisma.TransactionWhereInput = {
        userId: ctx.userId,
        deletedAt: null,
        ...(input.force
          ? {}
          : {
              OR: [
                { displayName: null },
                // Re-process display names that still look like raw bank data
                { displayName: { startsWith: "/TRTP/" } },
                { displayName: { contains: "/NAME/" } },
                { displayName: { contains: "/REMI/" } },
                { displayName: { contains: "/CSID/" } },
                { displayName: { contains: "/IBAN/" } },
              ],
            }),
      };

      const transactions = await ctx.prisma.transaction.findMany({
        where,
        select: { id: true, description: true, displayName: true },
      });

      let updated = 0;
      for (const txn of transactions) {
        const displayName = extractDisplayName(txn.description);
        // Only update if the new extraction is different
        if (displayName !== txn.displayName) {
          await ctx.prisma.transaction.update({
            where: { id: txn.id },
            data: { displayName },
          });
          updated++;
        }
      }

      return { updated, total: transactions.length };
    }),

  confirmOpheliaSuggestions: householdProcedure
    .input(
      z.object({
        transactionIds: z.array(z.string()).optional(),
        budgetScope: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const baseWhere = visibleTransactionsWhere(ctx.userId, ctx.householdId);
      const where: Prisma.TransactionWhereInput = {
        AND: [
          baseWhere,
          {
            account: { ownership: input.budgetScope },
            categoryId: null,
            opheliaCategoryId: { not: null },
            ...(input.transactionIds?.length && { id: { in: input.transactionIds } }),
          },
        ],
      };

      const txns = await ctx.prisma.transaction.findMany({
        where,
        select: { id: true, opheliaCategoryId: true },
      });

      if (txns.length === 0) return { confirmed: 0 };

      await ctx.prisma.$transaction(
        txns.map((tx) =>
          ctx.prisma.transaction.update({
            where: { id: tx.id },
            data: { categoryId: tx.opheliaCategoryId, effectiveCategoryId: tx.opheliaCategoryId },
          })
        )
      );

      return { confirmed: txns.length };
    }),

  bulkDelete: householdProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const transactions = await ctx.prisma.transaction.findMany({
        where: {
          id: { in: input.ids },
          ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
        },
        include: {
          linkedTransaction: true,
          linkedBy: true,
        },
      });

      if (transactions.length !== input.ids.length) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${input.ids.length - transactions.length} transaction(s) not found or not accessible.`,
        });
      }

      // Compute full deletion set (including transfer partners) before the transaction
      const idsToDelete = new Set(input.ids);
      const balanceAdjustments = new Map<string, number>();

      for (const txn of transactions) {
        const current = balanceAdjustments.get(txn.accountId) ?? 0;
        balanceAdjustments.set(txn.accountId, current + txn.amount);

        const partner = txn.linkedTransaction ?? txn.linkedBy;
        if (partner && !idsToDelete.has(partner.id)) {
          idsToDelete.add(partner.id);
          const partnerCurrent = balanceAdjustments.get(partner.accountId) ?? 0;
          balanceAdjustments.set(partner.accountId, partnerCurrent + partner.amount);
        }
      }

      const allDeletedIds = Array.from(idsToDelete);

      await ctx.prisma.$transaction(async (tx) => {
        await tx.transaction.updateMany({
          where: { id: { in: allDeletedIds }, linkedTransactionId: { not: null } },
          data: { linkedTransactionId: null },
        });

        await tx.transaction.updateMany({
          where: { id: { in: allDeletedIds } },
          data: { deletedAt: new Date() },
        });

        for (const [accountId, amount] of balanceAdjustments) {
          await tx.financialAccount.update({
            where: { id: accountId },
            data: { balance: { decrement: amount } },
          });
        }
      });

      await ctx.prisma.auditLog.create({
        data: {
          action: "transaction.bulk_delete",
          entityType: "Transaction",
          entityId: allDeletedIds.join(","),
          userId: ctx.userId,
          metadata: { count: allDeletedIds.length },
        },
      });

      return { deleted: allDeletedIds.length, deletedIds: allDeletedIds };
    }),

  restore: householdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const transaction = await ctx.prisma.transaction.findFirst({
        where: {
          id: input.id,
          deletedAt: { not: null },
          account: {
            OR: [
              { ownerId: ctx.userId },
              { householdId: ctx.householdId, ownership: "SHARED" },
            ],
          },
        },
      });

      if (!transaction) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deleted transaction not found or you don't have permission.",
        });
      }

      // Find co-deleted transfer partner (same deletedAt timestamp)
      let partner: typeof transaction | null = null;
      if (transaction.type === "TRANSFER" && transaction.deletedAt) {
        partner = await ctx.prisma.transaction.findFirst({
          where: {
            id: { not: transaction.id },
            type: "TRANSFER",
            deletedAt: transaction.deletedAt,
            amount: -transaction.amount,
            accountId: { not: transaction.accountId },
          },
        });
      }

      await ctx.prisma.$transaction(async (tx) => {
        await tx.financialAccount.update({
          where: { id: transaction.accountId },
          data: { balance: { increment: transaction.amount } },
        });
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { deletedAt: null },
        });

        if (partner) {
          await tx.financialAccount.update({
            where: { id: partner.accountId },
            data: { balance: { increment: partner.amount } },
          });
          await tx.transaction.update({
            where: { id: partner.id },
            data: { deletedAt: null },
          });
        }
      });

      const restored = await ctx.prisma.transaction.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          account: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, icon: true } },
          tags: { include: { tag: true } },
        },
      });

      await ctx.prisma.auditLog.create({
        data: {
          action: "transaction.restore",
          entityType: "Transaction",
          entityId: partner ? `${input.id},${partner.id}` : input.id,
          userId: ctx.userId,
        },
      });

      return restored;
    }),

  bulkRestore: householdProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const transactions = await ctx.prisma.transaction.findMany({
        where: {
          id: { in: input.ids },
          deletedAt: { not: null },
          account: {
            OR: [
              { ownerId: ctx.userId },
              { householdId: ctx.householdId, ownership: "SHARED" },
            ],
          },
        },
        select: { id: true, amount: true, accountId: true },
      });

      if (transactions.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No restorable transactions found." });
      }

      await ctx.prisma.$transaction(async (tx) => {
        const balanceAdjustments = new Map<string, number>();
        for (const txn of transactions) {
          const current = balanceAdjustments.get(txn.accountId) ?? 0;
          balanceAdjustments.set(txn.accountId, current + txn.amount);
        }

        for (const [accountId, amount] of balanceAdjustments) {
          await tx.financialAccount.update({
            where: { id: accountId },
            data: { balance: { increment: amount } },
          });
        }

        await tx.transaction.updateMany({
          where: { id: { in: transactions.map(t => t.id) } },
          data: { deletedAt: null },
        });
      });

      await ctx.prisma.auditLog.create({
        data: {
          action: "transaction.bulk_restore",
          entityType: "Transaction",
          entityId: input.ids.join(","),
          userId: ctx.userId,
          metadata: { count: transactions.length },
        },
      });

      return { restored: transactions.length };
    }),

  /** Find potential transfer matches for a given transaction */
  findTransferMatches: householdProcedure
    .input(z.object({ transactionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const source = await ctx.prisma.transaction.findFirst({
        where: { id: input.transactionId, ...visibleTransactionsWhere(ctx.userId, ctx.householdId) },
        include: { account: { select: { id: true, name: true } } },
      });
      if (!source) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found." });
      }

      const targetAmount = -source.amount;
      const sourceDate = new Date(source.date);
      const dateFrom = new Date(sourceDate);
      dateFrom.setDate(dateFrom.getDate() - 3);
      const dateTo = new Date(sourceDate);
      dateTo.setDate(dateTo.getDate() + 3);

      const candidates = await ctx.prisma.transaction.findMany({
        where: {
          ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
          amount: targetAmount,
          accountId: { not: source.accountId },
          date: { gte: dateFrom, lte: dateTo },
          linkedTransactionId: null,
          linkedBy: { is: null },
          isInitialBalance: false,
        },
        include: { account: { select: { id: true, name: true } } },
        orderBy: { date: "asc" },
        take: 10,
      });

      // Sort by date proximity to source
      return candidates
        .map((c) => ({
          id: c.id,
          description: c.description,
          displayName: c.displayName,
          amount: c.amount,
          date: c.date,
          type: c.type,
          account: c.account,
        }))
        .sort((a, b) =>
          Math.abs(new Date(a.date).getTime() - sourceDate.getTime()) -
          Math.abs(new Date(b.date).getTime() - sourceDate.getTime())
        );
    }),

  /** Mark a transaction as a transfer and optionally link to a matching transaction */
  markAsTransfer: householdProcedure
    .input(z.object({
      transactionId: z.string(),
      linkedTransactionId: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const txn = await ctx.prisma.transaction.findFirst({
        where: { id: input.transactionId, ...visibleTransactionsWhere(ctx.userId, ctx.householdId) },
      });
      if (!txn) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found." });
      }
      if (txn.type === "TRANSFER") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Transaction is already a transfer." });
      }

      if (input.linkedTransactionId) {
        const partner = await ctx.prisma.transaction.findFirst({
          where: { id: input.linkedTransactionId, ...visibleTransactionsWhere(ctx.userId, ctx.householdId) },
        });
        if (!partner) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Linked transaction not found." });
        }
        if (partner.accountId === txn.accountId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Linked transaction must be in a different account." });
        }
        if (partner.linkedTransactionId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Linked transaction is already linked to another transaction." });
        }
        // Check partner isn't linked BY another transaction
        const linkedBy = await ctx.prisma.transaction.findFirst({
          where: { linkedTransactionId: partner.id },
        });
        if (linkedBy) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Linked transaction is already linked to another transaction." });
        }
        if (Math.abs(txn.amount) !== Math.abs(partner.amount)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Amounts do not match." });
        }

        // Determine outflow (negative) and inflow (positive) for linking direction
        const outflow = txn.amount < 0 ? txn : partner;
        const inflow = txn.amount < 0 ? partner : txn;

        const account = await ctx.prisma.financialAccount.findFirst({
          where: { id: txn.accountId },
          select: { ownership: true },
        });
        const scope = (account?.ownership ?? "SHARED") as "SHARED" | "PERSONAL";
        const matchedCategoryId = await getTransferCategoryId(
          ctx.prisma, ctx.householdId, scope, true,
        );

        await ctx.prisma.$transaction([
          ctx.prisma.transaction.update({
            where: { id: outflow.id },
            data: {
              type: "TRANSFER",
              categoryId: matchedCategoryId,
              effectiveCategoryId: matchedCategoryId,
              linkedTransactionId: inflow.id,
            },
          }),
          ctx.prisma.transaction.update({
            where: { id: inflow.id },
            data: {
              type: "TRANSFER",
              categoryId: matchedCategoryId,
              effectiveCategoryId: matchedCategoryId,
            },
          }),
        ]);
      } else {
        // Unlinked transfer (e.g. cash withdrawal)
        const account = await ctx.prisma.financialAccount.findFirst({
          where: { id: txn.accountId },
          select: { ownership: true },
        });
        const scope = (account?.ownership ?? "SHARED") as "SHARED" | "PERSONAL";
        const unmatchedCategoryId = await getTransferCategoryId(
          ctx.prisma, ctx.householdId, scope, false,
        );

        await ctx.prisma.transaction.update({
          where: { id: input.transactionId },
          data: {
            type: "TRANSFER",
            categoryId: unmatchedCategoryId,
            effectiveCategoryId: unmatchedCategoryId,
          },
        });
      }

      return { success: true };
    }),

  /** Unmark a transfer back to INCOME or EXPENSE */
  unmarkTransfer: householdProcedure
    .input(z.object({
      transactionId: z.string(),
      newType: z.enum(["INCOME", "EXPENSE"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const txn = await ctx.prisma.transaction.findFirst({
        where: { id: input.transactionId, ...visibleTransactionsWhere(ctx.userId, ctx.householdId) },
        select: { id: true, type: true, linkedTransactionId: true, accountId: true, amount: true, opheliaCategoryId: true },
      });
      if (!txn) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found." });
      }
      if (txn.type !== "TRANSFER") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Transaction is not a transfer." });
      }

      // Find the linked partner (either direction)
      const partnerId = txn.linkedTransactionId;
      const linkedByTxn = partnerId
        ? null
        : await ctx.prisma.transaction.findFirst({
            where: { linkedTransactionId: txn.id },
            select: { id: true, opheliaCategoryId: true },
          });
      const actualPartnerId = partnerId ?? linkedByTxn?.id;

      if (actualPartnerId) {
        const partnerType = input.newType === "INCOME" ? "EXPENSE" : "INCOME";
        const partnerOphelia = linkedByTxn?.opheliaCategoryId ?? null;
        await ctx.prisma.$transaction([
          // Unlink: clear the FK on whichever side holds it
          ctx.prisma.transaction.update({
            where: { id: partnerId ? txn.id : actualPartnerId },
            data: {
              linkedTransactionId: null,
              type: partnerId ? input.newType : partnerType,
              categoryId: null,
              effectiveCategoryId: computeEffectiveCategoryId(null, partnerId ? txn.opheliaCategoryId : partnerOphelia),
            },
          }),
          ctx.prisma.transaction.update({
            where: { id: partnerId ? actualPartnerId : txn.id },
            data: {
              type: partnerId ? partnerType : input.newType,
              categoryId: null,
              effectiveCategoryId: computeEffectiveCategoryId(null, partnerId ? partnerOphelia : txn.opheliaCategoryId),
            },
          }),
        ]);
      } else {
        // Unlinked transfer — just change the type
        await ctx.prisma.transaction.update({
          where: { id: input.transactionId },
          data: {
            type: input.newType,
            categoryId: null,
            effectiveCategoryId: computeEffectiveCategoryId(null, txn.opheliaCategoryId),
          },
        });
      }

      return { success: true };
    }),
});
