import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";
import { chatCompletion, extractJSON, isOpheliaEnabled } from "@/lib/ophelia";
import { visibleTransactionsWhere } from "@/lib/privacy";

export const categoryRouter = router({
  /** Flat list of leaf categories (for dropdowns — grouped by parent) */
  list: householdProcedure
    .input(
      z
        .object({
          visibility: z.enum(["SHARED", "PERSONAL"]).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const visibilityFilter = input?.visibility
        ? { visibility: input.visibility }
        : {};

      return ctx.prisma.category.findMany({
        where: {
          householdId: ctx.householdId,
          parentId: { not: null },
          ...visibilityFilter,
        },
        orderBy: [{ parent: { sortOrder: "asc" } }, { sortOrder: "asc" }],
        include: {
          parent: { select: { id: true, name: true, icon: true, color: true } },
          _count: { select: { transactions: true } },
        },
      });
    }),

  /** Full category tree: groups with their children */
  tree: householdProcedure
    .input(
      z
        .object({
          visibility: z.enum(["SHARED", "PERSONAL"]).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const visibilityFilter = input?.visibility
        ? { visibility: input.visibility }
        : {};

      return ctx.prisma.category.findMany({
        where: {
          householdId: ctx.householdId,
          parentId: null,
          ...visibilityFilter,
        },
        orderBy: { sortOrder: "asc" },
        include: {
          children: {
            where: visibilityFilter,
            orderBy: { sortOrder: "asc" },
            include: {
              _count: { select: { transactions: true } },
            },
          },
          _count: { select: { transactions: true, children: true } },
        },
      });
    }),

  create: householdProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        icon: z.string().optional(),
        color: z.string().optional(),
        parentId: z.string().nullable().optional(),
        visibility: z.enum(["SHARED", "PERSONAL"]).default("SHARED"),
        type: z.enum(["INCOME", "EXPENSE"]).default("EXPENSE"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // If creating under a parent, inherit the parent's visibility and type
      let visibility = input.visibility;
      let type = input.type;
      if (input.parentId) {
        const parent = await ctx.prisma.category.findFirst({
          where: { id: input.parentId, householdId: ctx.householdId },
        });
        if (!parent) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Parent group not found." });
        }
        // Children inherit parent visibility and type
        visibility = parent.visibility as "SHARED" | "PERSONAL";
        type = parent.type as "INCOME" | "EXPENSE";
      }

      const maxSort = await ctx.prisma.category.aggregate({
        where: {
          householdId: ctx.householdId,
          parentId: input.parentId ?? null,
        },
        _max: { sortOrder: true },
      });

      return ctx.prisma.category.create({
        data: {
          name: input.name,
          icon: input.icon,
          color: input.color,
          type,
          parentId: input.parentId,
          householdId: ctx.householdId,
          visibility,
          sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        },
      });
    }),

  update: householdProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50).optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        type: z.enum(["INCOME", "EXPENSE"]).optional(),
        sortOrder: z.number().int().optional(),
        parentId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const category = await ctx.prisma.category.findFirst({
        where: { id, householdId: ctx.householdId },
      });

      if (!category) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return ctx.prisma.category.update({ where: { id }, data });
    }),

  delete: householdProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const category = await ctx.prisma.category.findFirst({
        where: { id: input.id, householdId: ctx.householdId },
        include: {
          _count: { select: { transactions: true, children: true } },
        },
      });

      if (!category) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (category._count.transactions > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Cannot delete a category with transactions. Reassign them first.",
        });
      }

      if (category._count.children > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Cannot delete a group that has subcategories. Remove them first.",
        });
      }

      return ctx.prisma.category.delete({ where: { id: input.id } });
    }),

  /** Ophelia: suggest emoji icons for a category name */
  suggestIcon: householdProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        parentName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      console.log(`[Ophelia] suggestIcon called for: "${input.name}"`);
      if (!isOpheliaEnabled()) return { emojis: [] };

      const context = input.parentName
        ? ` in the "${input.parentName}" budget group`
        : "";
      const result = await chatCompletion({
        systemPrompt:
          'You are a budgeting assistant. Respond with ONLY a raw JSON array of 5 emoji strings. No markdown, no explanation, no code fences. Just the array. Example output: ["🛒","🏪","🍎","🧺","💳"]',
        userMessage: `Suggest 5 emoji icons for this budget category: "${input.name}"${context}`,
        temperature: 0.7,
        maxTokens: 100,
      });

      if (!result) return { emojis: [] };

      // Try content after </think> first (clean output)
      const afterThink = result.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      if (afterThink) {
        try {
          const direct = JSON.parse(afterThink);
          if (Array.isArray(direct) && direct.length > 0) {
            return { emojis: direct.filter((e) => typeof e === "string").slice(0, 5) };
          }
        } catch { /* fall through */ }
        const arr = extractJSON<string[]>(afterThink);
        if (Array.isArray(arr) && arr.length > 0) {
          return { emojis: arr.filter((e) => typeof e === "string").slice(0, 5) };
        }
      }

      // Fallback: extract emojis from the full response (model puts them in <think>)
      // Use Extended_Pictographic to capture all emoji types including ZWJ sequences
      const emojiMatches = [
        ...new Set(
          (result.match(/\p{Extended_Pictographic}(\u200D\p{Extended_Pictographic})*/gu) ?? [])
            .filter((e) => e.codePointAt(0)! > 0x00FF) // exclude ASCII-range symbols
        ),
      ];
      console.log(`[Ophelia] suggestIcon extracted from thinking for "${input.name}":`, emojiMatches);
      return { emojis: emojiMatches.slice(0, 5) };
    }),

  /** Bulk reorder categories and/or groups */
  reorder: householdProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            id: z.string(),
            sortOrder: z.number().int().min(0),
            parentId: z.string().nullable(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ids = input.items.map((i) => i.id);
      const count = await ctx.prisma.category.count({
        where: { id: { in: ids }, householdId: ctx.householdId },
      });
      if (count !== ids.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Some categories not found.",
        });
      }

      await ctx.prisma.$transaction(
        input.items.map((item) =>
          ctx.prisma.category.update({
            where: { id: item.id },
            data: { sortOrder: item.sortOrder, parentId: item.parentId },
          })
        )
      );

      return { success: true };
    }),

  /** Cost analysis for selected categories */
  costAnalysis: householdProcedure
    .input(z.object({
      categoryIds: z.array(z.string()).min(1).max(20),
      dateFrom: z.coerce.date().optional(),
      dateTo: z.coerce.date().optional(),
      visibility: z.enum(["SHARED", "PERSONAL"]),
    }))
    .query(async ({ ctx, input }) => {
      const dateFilter = {
        ...(input.dateFrom && { gte: input.dateFrom }),
        ...(input.dateTo && { lte: input.dateTo }),
      };

      const txns = await ctx.prisma.transaction.findMany({
        where: {
          ...visibleTransactionsWhere(ctx.userId, ctx.householdId),
          visibility: input.visibility,
          categoryId: { in: input.categoryIds },
          isInitialBalance: false,
          type: { not: "TRANSFER" },
          ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
        },
        select: {
          id: true, amount: true, date: true, type: true,
          description: true, displayName: true,
          account: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, icon: true, parent: { select: { name: true } } } },
        },
        orderBy: { date: "desc" },
      });

      const totalExpenses = txns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
      const totalIncome = txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
      const netCost = totalExpenses + totalIncome;

      // Calculate months spanned for monthly average
      const dates = txns.map((t) => new Date(t.date));
      let monthsSpanned = 1;
      if (dates.length > 1) {
        const min = Math.min(...dates.map((d) => d.getTime()));
        const max = Math.max(...dates.map((d) => d.getTime()));
        monthsSpanned = Math.max(1, Math.round((max - min) / (30.44 * 24 * 60 * 60 * 1000)));
      }

      // Category breakdown
      const catMap = new Map<string, { categoryId: string; categoryName: string; categoryIcon: string | null; parentName: string | null; totalAmount: number; count: number }>();
      for (const t of txns) {
        const key = t.category?.id ?? "__none__";
        const entry = catMap.get(key) ?? {
          categoryId: t.category?.id ?? "", categoryName: t.category?.name ?? "Uncategorized",
          categoryIcon: t.category?.icon ?? null, parentName: t.category?.parent?.name ?? null,
          totalAmount: 0, count: 0,
        };
        entry.totalAmount += t.amount;
        entry.count++;
        catMap.set(key, entry);
      }
      const byCategory = Array.from(catMap.values())
        .map((c) => ({ ...c, monthlyAverage: Math.round(c.totalAmount / monthsSpanned) }))
        .sort((a, b) => a.totalAmount - b.totalAmount);

      // Merchant breakdown (by displayName or description)
      const merchantMap = new Map<string, { name: string; totalAmount: number; count: number; lastDate: Date }>();
      for (const t of txns) {
        const name = t.displayName || t.description;
        const entry = merchantMap.get(name) ?? { name, totalAmount: 0, count: 0, lastDate: new Date(t.date) };
        entry.totalAmount += t.amount;
        entry.count++;
        if (new Date(t.date) > entry.lastDate) entry.lastDate = new Date(t.date);
        merchantMap.set(name, entry);
      }
      const byMerchant = Array.from(merchantMap.values())
        .sort((a, b) => a.totalAmount - b.totalAmount)
        .slice(0, 20);

      // Monthly breakdown
      const monthMap = new Map<string, { year: number; month: number; label: string; expenses: number; income: number; net: number }>();
      for (const t of txns) {
        const d = new Date(t.date);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        const entry = monthMap.get(key) ?? {
          year: d.getFullYear(), month: d.getMonth() + 1,
          label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
          expenses: 0, income: 0, net: 0,
        };
        if (t.amount < 0) entry.expenses += t.amount; else entry.income += t.amount;
        entry.net += t.amount;
        monthMap.set(key, entry);
      }
      const byMonth = Array.from(monthMap.values()).sort((a, b) => a.year - b.year || a.month - b.month);

      // Account breakdown
      const accMap = new Map<string, { accountId: string; accountName: string; totalAmount: number; count: number }>();
      for (const t of txns) {
        const entry = accMap.get(t.account.id) ?? { accountId: t.account.id, accountName: t.account.name, totalAmount: 0, count: 0 };
        entry.totalAmount += t.amount;
        entry.count++;
        accMap.set(t.account.id, entry);
      }

      return {
        totalExpenses, totalIncome, netCost,
        transactionCount: txns.length,
        monthlyAverage: Math.round(netCost / monthsSpanned),
        monthsSpanned,
        byCategory, byMerchant, byMonth,
        byAccount: Array.from(accMap.values()).sort((a, b) => a.totalAmount - b.totalAmount),
      };
    }),
});
