import { z } from "zod/v4";
import { router, protectedProcedure } from "../init";

export const notesRouter = router({
  /** Get the user's most recent note (or null if none exist) */
  getLatest: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.note.findFirst({
      where: { userId: ctx.userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, content: true, updatedAt: true },
    });
  }),

  /** Save (update) a note's content */
  save: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        content: z.string().max(50000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const note = await ctx.prisma.note.findFirst({
        where: { id: input.id, userId: ctx.userId },
      });
      if (!note) {
        return ctx.prisma.note.create({
          data: { id: input.id, content: input.content, userId: ctx.userId },
        });
      }
      return ctx.prisma.note.update({
        where: { id: input.id },
        data: { content: input.content },
      });
    }),

  /** Create a new blank note */
  create: protectedProcedure.mutation(async ({ ctx }) => {
    return ctx.prisma.note.create({
      data: { userId: ctx.userId, content: "" },
      select: { id: true, content: true, updatedAt: true },
    });
  }),

  /** Delete a note */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.note.deleteMany({
        where: { id: input.id, userId: ctx.userId },
      });
      return { success: true };
    }),
});
