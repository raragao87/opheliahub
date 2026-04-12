import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";

const ADMIN_EMAIL = "roberto.b.a.aragao@gmail.com";

function assertAdmin(email: string | null | undefined) {
  if (email !== ADMIN_EMAIL) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
  }
}

export const feedbackRouter = router({
  submit: protectedProcedure
    .input(
      z.object({
        type: z.enum(["BUG", "FEEDBACK", "IDEA"]),
        title: z.string().min(1).max(200),
        description: z.string().min(1).max(5000),
        pageUrl: z.string().optional(),
        userAgent: z.string().optional(),
        screenSize: z.string().optional(),
        errorLogs: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { email: true, name: true },
      });

      return ctx.prisma.feedback.create({
        data: {
          ...input,
          userId: ctx.userId,
          userEmail: user?.email ?? null,
          userName: user?.name ?? null,
        },
      });
    }),

  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["NEW", "SEEN", "RESOLVED"]).optional(),
        type: z.enum(["BUG", "FEEDBACK", "IDEA"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.session?.user?.email);

      const items = await ctx.prisma.feedback.findMany({
        where: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.type ? { type: input.type } : {}),
          ...(input.cursor ? { createdAt: { lt: new Date(input.cursor) } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const last = items.pop();
        nextCursor = last!.createdAt.toISOString();
      }

      return { items, nextCursor };
    }),

  counts: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx.session?.user?.email);

    const [total, bugs, feedbacks, ideas, newCount] = await Promise.all([
      ctx.prisma.feedback.count(),
      ctx.prisma.feedback.count({ where: { type: "BUG" } }),
      ctx.prisma.feedback.count({ where: { type: "FEEDBACK" } }),
      ctx.prisma.feedback.count({ where: { type: "IDEA" } }),
      ctx.prisma.feedback.count({ where: { status: "NEW" } }),
    ]);

    return { total, bugs, feedbacks, ideas, newCount };
  }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["NEW", "SEEN", "RESOLVED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.session?.user?.email);

      return ctx.prisma.feedback.update({
        where: { id: input.id },
        data: { status: input.status },
      });
    }),
});
