import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";
import { visibleTagsWhere, visibleTransactionsWhere } from "@/lib/privacy";

export const tagRouter = router({
  list: householdProcedure
    .input(
      z.object({
        groupId: z.string().optional(),
        includeArchived: z.boolean().default(false),
        visibility: z.enum(["SHARED", "PERSONAL"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.tag.findMany({
        where: {
          ...visibleTagsWhere(ctx.userId, ctx.householdId),
          ...(input.groupId && { groupId: input.groupId }),
          ...(!input.includeArchived && { isArchived: false }),
          ...(input.visibility && { visibility: input.visibility }),
        },
        orderBy: { sortOrder: "asc" },
        include: {
          group: { select: { id: true, name: true, color: true } },
          _count: { select: { transactions: true } },
        },
      });
    }),

  create: householdProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        color: z.string().optional(),
        groupId: z.string().optional(),
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const maxSort = await ctx.prisma.tag.aggregate({
        where: {
          ...visibleTagsWhere(ctx.userId, ctx.householdId),
          groupId: input.groupId ?? null,
        },
        _max: { sortOrder: true },
      });

      return ctx.prisma.tag.create({
        data: {
          ...input,
          userId: ctx.userId,
          sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        },
      });
    }),

  update: householdProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50).optional(),
        color: z.string().optional(),
        groupId: z.string().nullable().optional(),
        isArchived: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const tag = await ctx.prisma.tag.findFirst({
        where: { id, userId: ctx.userId },
      });

      if (!tag) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return ctx.prisma.tag.update({ where: { id }, data });
    }),

  delete: householdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tag = await ctx.prisma.tag.findFirst({
        where: { id: input.id, userId: ctx.userId },
      });

      if (!tag) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return ctx.prisma.tag.delete({ where: { id: input.id } });
    }),

  /** Bulk reorder tags (sortOrder + groupId) */
  reorderTags: householdProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            id: z.string(),
            sortOrder: z.number().int().min(0),
            groupId: z.string().nullable(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ids = input.items.map((i) => i.id);
      const count = await ctx.prisma.tag.count({
        where: { id: { in: ids }, ...visibleTagsWhere(ctx.userId, ctx.householdId) },
      });
      if (count !== ids.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Some tags not found.",
        });
      }

      await ctx.prisma.$transaction(
        input.items.map((item) =>
          ctx.prisma.tag.update({
            where: { id: item.id },
            data: { sortOrder: item.sortOrder, groupId: item.groupId },
          })
        )
      );

      return { success: true };
    }),

  // Tag Groups
  listGroups: householdProcedure
    .input(
      z.object({
        visibility: z.enum(["SHARED", "PERSONAL"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.tagGroup.findMany({
        where: {
          householdId: ctx.householdId,
          ...(input.visibility && { visibility: input.visibility }),
        },
        orderBy: { sortOrder: "asc" },
        include: {
          _count: { select: { tags: true } },
        },
      });
    }),

  createGroup: householdProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        icon: z.string().optional(),
        color: z.string().optional(),
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const maxSort = await ctx.prisma.tagGroup.aggregate({
        where: { householdId: ctx.householdId },
        _max: { sortOrder: true },
      });

      return ctx.prisma.tagGroup.create({
        data: {
          ...input,
          householdId: ctx.householdId,
          userId: ctx.userId,
          sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        },
      });
    }),

  updateGroup: householdProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50).optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.tagGroup.update({ where: { id }, data });
    }),

  deleteGroup: householdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Unlink tags from the group before deleting
      await ctx.prisma.tag.updateMany({
        where: { groupId: input.id },
        data: { groupId: null },
      });
      return ctx.prisma.tagGroup.delete({ where: { id: input.id } });
    }),

  /** Bulk reorder tag groups */
  reorderGroups: householdProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            id: z.string(),
            sortOrder: z.number().int().min(0),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ids = input.items.map((i) => i.id);
      const count = await ctx.prisma.tagGroup.count({
        where: { id: { in: ids }, householdId: ctx.householdId },
      });
      if (count !== ids.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Some tag groups not found.",
        });
      }

      await ctx.prisma.$transaction(
        input.items.map((item) =>
          ctx.prisma.tagGroup.update({
            where: { id: item.id },
            data: { sortOrder: item.sortOrder },
          })
        )
      );

      return { success: true };
    }),

  /** Aggregated analysis for one or more tags */
  tagAnalysis: householdProcedure
    .input(z.object({
      tagIds: z.array(z.string()).min(1).max(5),
      dateFrom: z.coerce.date().optional(),
      dateTo: z.coerce.date().optional(),
      visibility: z.enum(["SHARED", "PERSONAL"]),
    }))
    .query(async ({ ctx, input }) => {
      const tags = await ctx.prisma.tag.findMany({
        where: { id: { in: input.tagIds }, ...visibleTagsWhere(ctx.userId, ctx.householdId) },
        select: { id: true, name: true, group: { select: { name: true } } },
      });

      const results = await Promise.all(tags.map(async (tag) => {
        const dateFilter = {
          ...(input.dateFrom && { gte: input.dateFrom }),
          ...(input.dateTo && { lte: input.dateTo }),
        };

        const txns = await ctx.prisma.transaction.findMany({
          where: {
            ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
            visibility: input.visibility,
            tags: { some: { tagId: tag.id } },
            isInitialBalance: false,
            ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
          },
          select: {
            id: true,
            amount: true,
            date: true,
            description: true,
            displayName: true,
            account: { select: { id: true, name: true } },
            category: { select: { id: true, name: true, icon: true } },
          },
          orderBy: { date: "desc" },
        });

        const totalAmount = txns.reduce((s, t) => s + t.amount, 0);
        const dates = txns.map((t) => new Date(t.date));
        const dateRange = dates.length > 0
          ? { first: new Date(Math.min(...dates.map((d) => d.getTime()))), last: new Date(Math.max(...dates.map((d) => d.getTime()))) }
          : null;

        // Category breakdown
        const catMap = new Map<string, { categoryId: string | null; categoryName: string | null; categoryIcon: string | null; amount: number; count: number }>();
        for (const t of txns) {
          const key = t.category?.id ?? "__none__";
          const entry = catMap.get(key) ?? { categoryId: t.category?.id ?? null, categoryName: t.category?.name ?? null, categoryIcon: t.category?.icon ?? null, amount: 0, count: 0 };
          entry.amount += t.amount;
          entry.count++;
          catMap.set(key, entry);
        }

        // Account breakdown
        const accMap = new Map<string, { accountId: string; accountName: string; amount: number; count: number }>();
        for (const t of txns) {
          const entry = accMap.get(t.account.id) ?? { accountId: t.account.id, accountName: t.account.name, amount: 0, count: 0 };
          entry.amount += t.amount;
          entry.count++;
          accMap.set(t.account.id, entry);
        }

        // Monthly trend
        const monthMap = new Map<string, { year: number; month: number; label: string; amount: number; count: number }>();
        for (const t of txns) {
          const d = new Date(t.date);
          const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
          const entry = monthMap.get(key) ?? {
            year: d.getFullYear(), month: d.getMonth() + 1,
            label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
            amount: 0, count: 0,
          };
          entry.amount += t.amount;
          entry.count++;
          monthMap.set(key, entry);
        }
        const byMonth = Array.from(monthMap.values()).sort((a, b) => a.year - b.year || a.month - b.month);

        return {
          tagId: tag.id,
          tagName: tag.name,
          tagGroupName: tag.group?.name ?? null,
          totalAmount,
          transactionCount: txns.length,
          dateRange,
          byCategory: Array.from(catMap.values()).sort((a, b) => a.amount - b.amount),
          byAccount: Array.from(accMap.values()).sort((a, b) => a.amount - b.amount),
          byMonth,
          recentTransactions: txns.slice(0, 10).map((t) => ({
            id: t.id,
            date: t.date,
            description: t.description,
            displayName: t.displayName,
            amount: t.amount,
            accountName: t.account.name,
            categoryName: t.category?.name ?? null,
            categoryIcon: t.category?.icon ?? null,
          })),
        };
      }));

      return { tags: results };
    }),
});
