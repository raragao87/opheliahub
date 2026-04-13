import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";

export const investmentAssetRouter = router({
  list: householdProcedure.query(async ({ ctx }) => {
    return ctx.prisma.investmentAsset.findMany({
      where: { householdId: ctx.householdId },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
  }),

  create: householdProcedure
    .input(
      z.object({
        ticker: z.string().max(20).nullable().optional(),
        name: z.string().min(1).max(200),
        currency: z.string().length(3).default("EUR"),
        type: z.enum(["STOCK", "ETF", "BOND", "CRYPTO", "COMMODITY", "FUND", "OTHER"]),
        isin: z.string().max(12).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.investmentAsset.create({
        data: {
          ...input,
          ticker: input.ticker || null,
          isin: input.isin || null,
          householdId: ctx.householdId,
        },
      });
    }),

  update: householdProcedure
    .input(
      z.object({
        id: z.string(),
        ticker: z.string().max(20).nullable().optional(),
        name: z.string().min(1).max(200).optional(),
        currency: z.string().length(3).optional(),
        type: z.enum(["STOCK", "ETF", "BOND", "CRYPTO", "COMMODITY", "FUND", "OTHER"]).optional(),
        isin: z.string().max(12).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.prisma.investmentAsset.findFirst({
        where: { id, householdId: ctx.householdId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found." });
      }
      return ctx.prisma.investmentAsset.update({ where: { id }, data });
    }),

  delete: householdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.investmentAsset.findFirst({
        where: { id: input.id, householdId: ctx.householdId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found." });
      }
      const txnCount = await ctx.prisma.transaction.count({
        where: { investmentAssetId: input.id },
      });
      if (txnCount > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Cannot delete asset with ${txnCount} linked transaction(s). Reassign them first.`,
        });
      }
      return ctx.prisma.investmentAsset.delete({ where: { id: input.id } });
    }),
});
