import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, householdProcedure } from "../init";
import { visibleTransactionsWhere, visibleAccountsWhere } from "@/lib/privacy";
import { LIQUID_ACCOUNT_TYPES } from "@/lib/account-types";
import { extractDisplayName } from "@/lib/recurring";

export const transactionRouter = router({
  list: householdProcedure
    .input(
      z.object({
        accountId: z.string().optional(),
        accountIds: z.array(z.string()).optional(),
        categoryId: z.string().optional(),
        categoryIds: z.array(z.string()).optional(),
        type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
        transferType: z.enum(["INTERNAL", "EXTERNAL"]).optional(),
        visibility: z.enum(["SHARED", "PERSONAL"]).optional(),
        tagId: z.string().optional(),
        tagIds: z.array(z.string()).optional(),
        uncategorized: z.boolean().optional(),
        noTags: z.boolean().optional(),
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
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.TransactionWhereInput = {
        AND: [
          // Privacy filter (contains its own OR clause)
          visibleTransactionsWhere(ctx.userId, ctx.householdId),
          // All other filters
          {
            // Account filter: array takes precedence over single
            ...(input.accountIds?.length
              ? { accountId: { in: input.accountIds } }
              : input.accountId
                ? { accountId: input.accountId }
                : {}),
            // Category filter: array takes precedence, uncategorized overrides both
            ...(input.uncategorized
              ? { categoryId: null }
              : input.categoryIds?.length
                ? { categoryId: { in: input.categoryIds } }
                : input.categoryId
                  ? { categoryId: input.categoryId }
                  : {}),
            // transferType takes precedence over type (forces TRANSFER)
            ...(input.transferType
              ? { type: "TRANSFER" as const }
              : input.type
                ? { type: input.type }
                : {}),
            ...(input.visibility && { visibility: input.visibility }),
            // Tag filter: noTags overrides tagIds; array takes precedence over single
            ...(input.noTags
              ? { tags: { none: {} } }
              : input.tagIds?.length
                ? { tags: { some: { tagId: { in: input.tagIds } } } }
                : input.tagId
                  ? { tags: { some: { tagId: input.tagId } } }
                  : {}),
            // Date filter exempts initial balance transactions so they always appear
            ...(input.dateFrom || input.dateTo
              ? {
                  OR: [
                    { isInitialBalance: true },
                    {
                      date: {
                        ...(input.dateFrom && { gte: input.dateFrom }),
                        ...(input.dateTo && { lte: input.dateTo }),
                      },
                    },
                  ],
                }
              : {}),
            ...(input.search && {
              OR: [
                { description: { contains: input.search, mode: "insensitive" as const } },
                { displayName: { contains: input.search, mode: "insensitive" as const } },
              ],
            }),
            ...(input.amountMin !== undefined || input.amountMax !== undefined
              ? {
                  amount: {
                    ...(input.amountMin !== undefined && { gte: input.amountMin }),
                    ...(input.amountMax !== undefined && { lte: input.amountMax }),
                  },
                }
              : {}),
            // External: no linked partner at all
            ...(input.transferType === "EXTERNAL" && {
              linkedTransactionId: null,
              linkedBy: { is: null },
            }),
          },
          // Internal: has a linked partner on either side (needs its own OR)
          ...(input.transferType === "INTERNAL"
            ? [{
                OR: [
                  { linkedTransactionId: { not: null } },
                  { linkedBy: { isNot: null } },
                ],
              }]
            : []),
          // Liquid-only: separate AND entry to avoid conflicting with privacy account filter
          ...(input.liquidOnly
            ? [{ account: { type: { in: LIQUID_ACCOUNT_TYPES } } }]
            : []),
          // Accrual date filter: effective budget date (accrualDate ?? date).
          // Used by the tracker drill-down. Initial balance is always exempt.
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
          account: { select: { id: true, name: true, type: true, institution: true } },
          category: { select: { id: true, name: true, icon: true, color: true } },
          opheliaCategory: { select: { id: true, name: true } },
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
        type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
        description: z.string().min(1).max(500),
        date: z.coerce.date(),
        accountId: z.string(),
        toAccountId: z.string().optional(),
        categoryId: z.string().optional(),
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
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
              visibility: input.visibility,
              notes: input.notes,
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
              visibility: input.visibility,
              notes: input.notes,
              linkedTransactionId: inflow.id,
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
      const { tagIds, toAccountId: _toAccountId, ...data } = input;

      const transaction = await ctx.prisma.transaction.create({
        data: {
          ...data,
          userId: ctx.userId,
          displayName: extractDisplayName(data.description),
          originalDescription: data.description,
          tags: tagIds.length > 0
            ? {
                create: tagIds.map((tagId) => ({ tagId })),
              }
            : undefined,
        },
        include: {
          account: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, icon: true } },
          tags: { include: { tag: true } },
        },
      });

      // Update account balance
      await ctx.prisma.financialAccount.update({
        where: { id: input.accountId },
        data: { balance: { increment: input.amount } },
      });

      return transaction;
    }),

  update: householdProcedure
    .input(
      z.object({
        id: z.string(),
        amount: z.number().int().optional(),
        type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
        description: z.string().min(1).max(500).optional(),
        displayName: z.string().max(100).nullable().optional(),
        date: z.coerce.date().optional(),
        accrualDate: z.coerce.date().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        visibility: z.enum(["SHARED", "PERSONAL"]).optional(),
        notes: z.string().nullable().optional(),
        tagIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.transaction.findFirst({
        where: {
          id: input.id,
          ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
        },
        include: {
          linkedTransaction: true,
          linkedBy: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transaction not found or you don't have permission.",
        });
      }

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
            const { id, tagIds, type: _type, ...data } = input;

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
            if (data.visibility !== undefined) updateData.visibility = data.visibility;
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
            if (data.visibility !== undefined) partnerData.visibility = data.visibility;
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
      const { id, tagIds, ...data } = input;

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

      return ctx.prisma.transaction.update({
        where: { id },
        data,
        include: {
          account: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, icon: true } },
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

            // Delete both transactions
            await tx.transaction.delete({ where: { id: transaction.id } });
            await tx.transaction.delete({ where: { id: partner.id } });

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

      return ctx.prisma.transaction.delete({ where: { id: input.id } });
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
        select: { id: true },
      });
      const accessibleIds = accessible.map((t) => t.id);

      if (accessibleIds.length !== input.ids.length) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${input.ids.length - accessibleIds.length} transaction(s) not found or not accessible.`,
        });
      }

      await ctx.prisma.transaction.updateMany({
        where: { id: { in: accessibleIds } },
        data: { categoryId: input.categoryId },
      });

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

  bulkUpdateVisibility: householdProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(500),
        visibility: z.enum(["SHARED", "PERSONAL"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Only the owner can change visibility
      const accessible = await ctx.prisma.transaction.findMany({
        where: {
          id: { in: input.ids },
          userId: ctx.userId,
        },
        select: { id: true },
      });
      const accessibleIds = accessible.map((t) => t.id);

      if (accessibleIds.length !== input.ids.length) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${input.ids.length - accessibleIds.length} transaction(s) cannot be modified — you can only change visibility on your own transactions.`,
        });
      }

      await ctx.prisma.transaction.updateMany({
        where: { id: { in: accessibleIds } },
        data: { visibility: input.visibility },
      });

      await ctx.prisma.auditLog.create({
        data: {
          action: "transaction.bulk_update_visibility",
          entityType: "Transaction",
          entityId: accessibleIds.join(","),
          userId: ctx.userId,
          metadata: { visibility: input.visibility, count: accessibleIds.length },
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

  /** Sync every transaction's visibility to match its account's ownership (SHARED account → SHARED tx, PERSONAL account → PERSONAL tx) */
  fixVisibility: householdProcedure
    .mutation(async ({ ctx }) => {
      // Fetch all transactions in the household along with their account ownership
      const transactions = await ctx.prisma.transaction.findMany({
        where: {
          account: { householdId: ctx.householdId },
        },
        select: {
          id: true,
          visibility: true,
          account: { select: { ownership: true } },
        },
      });

      const toFix = transactions.filter((t) => t.visibility !== t.account.ownership);
      if (toFix.length === 0) return { fixed: 0 };

      const personalIds = toFix.filter((t) => t.account.ownership === "PERSONAL").map((t) => t.id);
      const sharedIds   = toFix.filter((t) => t.account.ownership === "SHARED").map((t) => t.id);

      await ctx.prisma.$transaction([
        ...(sharedIds.length > 0
          ? [ctx.prisma.transaction.updateMany({ where: { id: { in: sharedIds } },   data: { visibility: "SHARED" } })]
          : []),
        ...(personalIds.length > 0
          ? [ctx.prisma.transaction.updateMany({ where: { id: { in: personalIds } }, data: { visibility: "PERSONAL" } })]
          : []),
      ]);

      return { fixed: toFix.length };
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

      await ctx.prisma.$transaction(async (tx) => {
        const idsToDelete = new Set(input.ids);
        const balanceAdjustments = new Map<string, number>();

        for (const txn of transactions) {
          const current = balanceAdjustments.get(txn.accountId) ?? 0;
          balanceAdjustments.set(txn.accountId, current + txn.amount);

          // Include transfer partners not already in the list
          const partner = txn.linkedTransaction ?? txn.linkedBy;
          if (partner && !idsToDelete.has(partner.id)) {
            idsToDelete.add(partner.id);
            const partnerCurrent = balanceAdjustments.get(partner.accountId) ?? 0;
            balanceAdjustments.set(partner.accountId, partnerCurrent + partner.amount);
          }
        }

        // Nullify linked FKs to avoid constraint violations
        await tx.transaction.updateMany({
          where: { id: { in: Array.from(idsToDelete) }, linkedTransactionId: { not: null } },
          data: { linkedTransactionId: null },
        });

        // Delete tags
        await tx.transactionTag.deleteMany({
          where: { transactionId: { in: Array.from(idsToDelete) } },
        });

        // Delete transactions
        await tx.transaction.deleteMany({
          where: { id: { in: Array.from(idsToDelete) } },
        });

        // Reverse balance effects
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
          entityId: input.ids.join(","),
          userId: ctx.userId,
          metadata: { count: input.ids.length },
        },
      });

      return { deleted: input.ids.length };
    }),
});
