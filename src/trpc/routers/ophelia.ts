import { z } from "zod";
import { householdProcedure, router } from "../init";
import { analyzeFileStructure, enrichTransactions, isOpheliaEnabled } from "@/lib/ophelia";
import { categorizeTransactionBatch } from "@/lib/ophelia/categorize-batch";
import { extractFromUnknown } from "@/lib/ophelia/extractFromUnknown";

export const opheliaRouter = router({
  /**
   * Sends the first ~30 lines of a bank file to the AI and returns detected
   * column mappings, date format, decimal separator, and other metadata.
   *
   * Returns null when Ophelia is disabled, the API call fails, or the
   * response cannot be parsed — the caller falls back to manual mapping.
   */
  analyzeFile: householdProcedure
    .input(
      z.object({
        /** First ~30 lines of the file as a plain-text string (already CSV or TSV). */
        rawContent: z.string().max(100_000),
        /** Original filename — helps the AI detect the bank format. */
        filename: z.string().max(255),
        /** Detected delimiter: "," for CSV, "\t" for TSV. */
        delimiter: z.string().max(4).optional(),
      })
    )
    .mutation(async ({ input }) => {
      if (!isOpheliaEnabled()) return null;
      return analyzeFileStructure({
        rawContent: input.rawContent,
        filename: input.filename,
        delimiter: input.delimiter,
      });
    }),

  /**
   * Enriches a batch of parsed transactions with category suggestions,
   * clean display names, and tag suggestions.
   *
   * Fetches the user's category list, tag list, and 20 recent categorized
   * transactions as few-shot examples, then calls the Ophelia AI.
   *
   * Returns null when Ophelia is disabled, the API call fails, or the
   * response cannot be parsed — the caller falls back to no suggestions.
   */
  enrichTransactions: householdProcedure
    .input(
      z.object({
        transactions: z.array(
          z.object({
            date: z.string(),
            description: z.string(),
            amount: z.number().int(),
            counterpartyName: z.string().optional(),
          })
        ),
        /** Visibility of the target account — used to scope categories and tags. */
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isOpheliaEnabled()) return null;
      if (input.transactions.length === 0) return [];

      // Fetch only categories matching the import visibility
      const dbCategories = await ctx.prisma.category.findMany({
        where: {
          householdId: ctx.householdId,
          parentId: { not: null },
          visibility: input.visibility,
        },
        select: { id: true, name: true, parent: { select: { name: true } } },
        orderBy: [{ parent: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      });

      // Fetch active tags matching the import visibility
      const dbTags = await ctx.prisma.tag.findMany({
        where: {
          visibility: input.visibility,
          ...(input.visibility === "PERSONAL" && { userId: ctx.userId }),
          isArchived: false,
        },
        select: { id: true, name: true, group: { select: { name: true } } },
        orderBy: { sortOrder: "asc" },
      });

      // Fetch 20 recent categorized transactions as few-shot examples (same visibility)
      const recentTxns = await ctx.prisma.transaction.findMany({
        where:
          input.visibility === "SHARED"
            ? { visibility: "SHARED", account: { householdId: ctx.householdId }, categoryId: { not: null } }
            : { visibility: "PERSONAL", userId: ctx.userId, categoryId: { not: null } },
        orderBy: { date: "desc" },
        take: 20,
        select: {
          description: true,
          displayName: true,
          category: { select: { name: true } },
          tags: { select: { tag: { select: { name: true } } } },
        },
      });

      return enrichTransactions({
        transactions: input.transactions,
        categories: dbCategories.map((c) => ({
          id: c.id,
          name: c.name,
          parentName: c.parent?.name ?? undefined,
        })),
        tags: dbTags.map((t) => ({
          id: t.id,
          name: t.name,
          groupName: t.group?.name ?? undefined,
        })),
        recentExamples: recentTxns.map((t) => ({
          description: t.description,
          categoryName: t.category!.name,
          displayName: t.displayName ?? t.description,
          tags: t.tags.map((tt) => tt.tag.name),
        })),
      });
    }),

  /**
   * Triggers Ophelia background categorization for the current user's household.
   * Processes up to 50 uncategorized (or stale) transactions and returns a summary.
   * Returns { skipped: true } if Ophelia is disabled.
   */
  runCategorization: householdProcedure
    .input(z.object({ batchSize: z.number().int().min(1).max(1000).default(200) }).optional())
    .mutation(async ({ ctx, input }) => {
      if (!isOpheliaEnabled()) return { processed: 0, skipped: 0, errors: 0, hasMore: false, opheliaEnabled: false };

      const result = await categorizeTransactionBatch(
        ctx.prisma,
        ctx.householdId,
        input?.batchSize ?? 200
      );

      return { ...result, opheliaEnabled: true };
    }),

  /**
   * Tries to extract transactions from a file in an unrecognized format.
   * Called when no built-in parser handles the file extension/content.
   *
   * Returns null when Ophelia is disabled, the API call fails, or the
   * response cannot be parsed — the caller falls back to showing an error.
   */
  extractUnknownFormat: householdProcedure
    .input(
      z.object({
        /** First ~100 lines / 8 KB of the file as plain text */
        rawContent: z.string().max(50_000),
        /** Original filename — helps the AI identify the format */
        filename: z.string().max(255),
      })
    )
    .mutation(async ({ input }) => {
      if (!isOpheliaEnabled()) return null;
      return extractFromUnknown(input.rawContent, input.filename);
    }),
});
