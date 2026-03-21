import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import { chatConversation, isOpheliaEnabled } from "@/lib/ophelia";
import type { PageContext } from "@/lib/ophelia/page-context";

const pageContextSchema = z.object({
  path: z.string(),
  pageName: z.string(),
  visibility: z.enum(["SHARED", "PERSONAL"]),
  month: z.string().optional(),
  summary: z.string().optional(),
  suggestedPrompts: z.array(z.string()),
});

function buildSystemPrompt(ctx: PageContext, userName: string | null): string {
  return `You are Ophelia, the AI assistant built into OpheliaHub — a personal finance management app for couples.

You are warm, knowledgeable about personal finance, and concise. You speak like a trusted financial advisor who also happens to know every feature of the app.

## Your Capabilities
- Explain any feature of OpheliaHub (budgeting, funds, imports, tags, net worth, etc.)
- Help users understand their financial data and make better decisions
- Suggest how to allocate budgets, organize categories and tags, and improve financial health
- Answer general personal finance questions (budgeting strategies, saving tips, debt management)
- Guide users through app workflows (importing transactions, setting up funds, reviewing budgets)

## Current Context
The user is currently viewing: ${ctx.pageName} (${ctx.path})
Visibility mode: ${ctx.visibility}
${ctx.month ? `Viewing month: ${ctx.month}` : ""}
${ctx.summary ? `Page summary: ${ctx.summary}` : ""}

## Important Rules
- Keep responses concise — 2-4 short paragraphs max unless the user asks for detail.
- Use € as the default currency unless the user mentions otherwise.
- When discussing specific numbers, always be clear about the time period (this month, this year, etc.)
- NEVER fabricate financial data. If you don't have specific numbers from the page context, say so and suggest where in the app to find them.
- NEVER share or reference one partner's personal financial data with the other. You are talking to one user — respect privacy boundaries.
- If the user asks about something you can't help with, suggest the right page or feature in the app.
- Format amounts consistently: €1,234.56
- You can use markdown for formatting (bold, lists, etc.) but keep it minimal.
- If the user seems stressed about finances, be empathetic and constructive — focus on actionable next steps.

## App Feature Knowledge
- **Dashboard**: Overview of income, expenses, savings rate, and net worth for the current month.
- **Tracker**: Zero-based budgeting hub. Shows budget health, category allocations vs. actuals, progress bars. "Money left to assign" should be €0 in a balanced budget.
- **Planner**: Analysis hub with tabs — Upcoming (recurring rules, cash flow), Tags (tag groups and spending analysis), Cost Analysis (category/merchant drill-down), Reports (monthly review dashboard).
- **Funds**: Envelope budgeting. Each fund is like a virtual savings envelope backed by real transactions. Users set monthly budgets and track actuals.
- **Transactions**: Full transaction list with filters, search, bulk operations. Import from CSV/MT940 bank files.
- **Net Worth**: All accounts + assets − debts. Tracks trend over time.
- **Settings**: Profile, household management, partner invitation, categories, preferences.

## Conversation Style
- First message in a conversation: greet briefly and acknowledge what page they're on.
- Follow-up messages: skip greetings, be direct.
- If the user asks a vague question, ask one clarifying question rather than guessing.
${userName ? `- Use the user's name if appropriate: ${userName}.` : ""}`;
}

// Rate limiting: track per-user message timestamps in memory
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 30;

function checkRateLimit(userId: string): void {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "You've sent a lot of messages! Please wait a bit before sending more.",
    });
  }
  recent.push(now);
  rateLimitMap.set(userId, recent);
}

export const chatRouter = router({
  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().optional(),
        message: z.string().min(1).max(2000),
        pageContext: pageContextSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isOpheliaEnabled()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Ophelia is not enabled.",
        });
      }

      checkRateLimit(ctx.userId);

      let conversationId = input.conversationId;

      // Create or verify conversation
      if (!conversationId) {
        const conversation = await ctx.prisma.chatConversation.create({
          data: { userId: ctx.userId },
        });
        conversationId = conversation.id;
      } else {
        const existing = await ctx.prisma.chatConversation.findFirst({
          where: { id: conversationId, userId: ctx.userId },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
        }
      }

      // Save user message
      await ctx.prisma.chatMessage.create({
        data: {
          conversationId,
          role: "user",
          content: input.message,
          pageContext: JSON.stringify(input.pageContext),
        },
      });

      // Load conversation history (last 20 messages)
      const history = await ctx.prisma.chatMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        take: 20,
        select: { role: true, content: true },
      });

      // Build messages array for AI
      const messages = history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // Get user name
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { name: true },
      });

      // Call AI
      const systemPrompt = buildSystemPrompt(input.pageContext, user?.name ?? null);
      const response = await chatConversation({
        systemPrompt,
        messages,
      });

      if (!response) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Sorry, I couldn't generate a response. Please try again.",
        });
      }

      // Save assistant message
      await ctx.prisma.chatMessage.create({
        data: {
          conversationId,
          role: "assistant",
          content: response,
        },
      });

      // Auto-title on first exchange (fire-and-forget)
      if (history.length <= 1) {
        const title = input.message.length > 50
          ? input.message.slice(0, 47) + "..."
          : input.message;
        ctx.prisma.chatConversation
          .update({ where: { id: conversationId }, data: { title } })
          .catch(() => {});
      }

      // Touch updatedAt
      ctx.prisma.chatConversation
        .update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
        .catch(() => {});

      return {
        conversationId,
        message: response,
      };
    }),

  getConversation: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const conversation = await ctx.prisma.chatConversation.findFirst({
        where: { id: input.conversationId, userId: ctx.userId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            select: { id: true, role: true, content: true, createdAt: true },
          },
        },
      });

      if (!conversation) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return conversation;
    }),

  listConversations: protectedProcedure
    .input(
      z.object({ limit: z.number().int().min(1).max(50).default(20) }).optional()
    )
    .query(async ({ ctx, input }) => {
      const conversations = await ctx.prisma.chatConversation.findMany({
        where: { userId: ctx.userId },
        orderBy: { updatedAt: "desc" },
        take: input?.limit ?? 20,
        select: {
          id: true,
          title: true,
          updatedAt: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, role: true },
          },
        },
      });

      return conversations.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
        lastMessage: c.messages[0]?.content?.slice(0, 80) ?? null,
      }));
    }),

  deleteConversation: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const conversation = await ctx.prisma.chatConversation.findFirst({
        where: { id: input.conversationId, userId: ctx.userId },
      });
      if (!conversation) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await ctx.prisma.chatConversation.delete({
        where: { id: input.conversationId },
      });
      return { success: true };
    }),
});
