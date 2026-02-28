import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";
import { visibleTagsWhere } from "@/lib/privacy";

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
        where: { id: { in: ids }, userId: ctx.userId },
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
});
