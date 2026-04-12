import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";

export const authRouter = router({
  getSession: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    });

    const membership = await ctx.prisma.householdMember.findFirst({
      where: { userId: ctx.userId, inviteStatus: "ACCEPTED" },
      include: { household: true },
    });

    return {
      user,
      household: membership?.household ?? null,
      householdRole: membership?.role ?? null,
    };
  }),

  accountStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;

    const membership = await ctx.prisma.householdMember.findFirst({
      where: { userId, inviteStatus: "ACCEPTED" },
      include: {
        household: {
          select: {
            id: true,
            name: true,
            members: {
              where: { inviteStatus: "ACCEPTED", userId: { not: userId } },
              include: { user: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    const partner = membership?.household.members[0] ?? null;
    const householdId = membership?.householdId ?? null;

    // Personal accounts (owned by user)
    const personalAccounts = await ctx.prisma.financialAccount.findMany({
      where: { ownerId: userId, ownership: "PERSONAL" },
      select: { id: true },
    });
    const personalAccountIds = personalAccounts.map((a) => a.id);

    // Shared accounts (owned by user but shared)
    const sharedAccountsCount = await ctx.prisma.financialAccount.count({
      where: { ownerId: userId, ownership: "SHARED" },
    });

    // Counts in personal accounts
    const personalTxnCount = personalAccountIds.length > 0
      ? await ctx.prisma.transaction.count({
          where: { accountId: { in: personalAccountIds } },
        })
      : 0;

    // Shared transactions (across all household accounts)
    const sharedTxnCount = householdId
      ? await ctx.prisma.transaction.count({
          where: {
            account: { householdId, ownership: "SHARED" },
          },
        })
      : 0;

    const assetsCount = await ctx.prisma.asset.count({ where: { userId } });
    const debtsCount = await ctx.prisma.debt.count({ where: { userId } });
    const tagsCount = await ctx.prisma.tag.count({ where: { userId } });

    const memberCount = membership
      ? await ctx.prisma.householdMember.count({
          where: { householdId: membership.householdId, inviteStatus: "ACCEPTED" },
        })
      : 0;

    return {
      personalAccounts: personalAccountIds.length,
      sharedAccounts: sharedAccountsCount,
      personalTransactions: personalTxnCount,
      sharedTransactions: sharedTxnCount,
      assets: assetsCount,
      debts: debtsCount,
      tags: tagsCount,
      isHouseholdOwner: membership?.role === "OWNER",
      householdName: membership?.household.name ?? null,
      partnerName: partner?.user.name ?? null,
      isOnlyMember: memberCount <= 1,
    };
  }),

  updateProfile: protectedProcedure
    .input(z.object({
      name: z.string().optional(),
      locale: z.string().optional(),
      language: z.string().optional(),
      defaultVisibility: z.enum(["SHARED", "PERSONAL"]).optional(),
      theme: z.enum(["light", "dark", "system"]).optional(),
      colorTheme: z.enum(["classic", "luminous"]).optional(),
      budgetMonthsLinked: z.boolean().optional(),
      showInvestment: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.locale !== undefined) data.locale = input.locale;
      if (input.language !== undefined) data.language = input.language;
      if (input.defaultVisibility !== undefined) data.defaultVisibility = input.defaultVisibility;
      if (input.theme !== undefined) data.theme = input.theme;
      if (input.colorTheme !== undefined) data.colorTheme = input.colorTheme;
      if (input.budgetMonthsLinked !== undefined) data.budgetMonthsLinked = input.budgetMonthsLinked;
      if (input.showInvestment !== undefined) data.showInvestment = input.showInvestment;
      const user = await ctx.prisma.user.update({ where: { id: ctx.userId }, data });
      return user;
    }),

  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { locale: true, language: true, defaultVisibility: true, theme: true, colorTheme: true, budgetMonthsLinked: true, showInvestment: true, name: true, email: true, image: true },
    });
    return user ?? { locale: "nl-NL", language: "en", defaultVisibility: "SHARED" as const, theme: "system", colorTheme: "luminous", budgetMonthsLinked: true, showInvestment: true, name: null, email: null, image: null };
  }),

  deleteAccount: protectedProcedure
    .input(z.object({ confirmEmail: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId;

      // Verify the user exists and email matches
      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      if (input.confirmEmail !== user.email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Email confirmation does not match your account email.",
        });
      }

      // Gather membership context BEFORE the transaction
      const membership = await ctx.prisma.householdMember.findFirst({
        where: { userId, inviteStatus: "ACCEPTED" },
        include: {
          household: {
            include: {
              members: {
                where: { inviteStatus: "ACCEPTED", userId: { not: userId } },
                select: { userId: true, role: true },
              },
            },
          },
        },
      });

      const householdId = membership?.householdId ?? null;
      const isOwner = membership?.role === "OWNER";
      const partnerId = membership?.household.members[0]?.userId ?? null;

      await ctx.prisma.$transaction(
        async (tx) => {
          // ── PHASE 1: Reassign shared resources to partner ──────────
          if (partnerId && householdId) {
            // Reassign shared financial accounts to partner
            await tx.financialAccount.updateMany({
              where: { ownerId: userId, ownership: "SHARED" },
              data: { ownerId: partnerId },
            });

            // Reassign shared tags to partner
            await tx.tag.updateMany({
              where: { userId, visibility: "SHARED" },
              data: { userId: partnerId },
            });

            // Reassign shared tag groups to partner
            await tx.tagGroup.updateMany({
              where: { userId, visibility: "SHARED" },
              data: { userId: partnerId },
            });

            // Transfer household ownership if user is the owner
            if (isOwner) {
              await tx.householdMember.updateMany({
                where: { householdId, userId: partnerId },
                data: { role: "OWNER" },
              });
            }
          }

          // ── Get personal account IDs ────────────────────────────────
          const personalAccounts = await tx.financialAccount.findMany({
            where: { ownerId: userId, ownership: "PERSONAL" },
            select: { id: true },
          });
          const personalAccountIds = personalAccounts.map((a) => a.id);

          // ── PHASE 2: Unlink transfers ──────────────────────────────
          if (personalAccountIds.length > 0) {
            // Get IDs of personal transactions
            const personalTxnIds = await tx.transaction
              .findMany({
                where: { accountId: { in: personalAccountIds } },
                select: { id: true },
              })
              .then((rows) => rows.map((r) => r.id));

            // Unlink: personal txns that point to others → null their link
            await tx.transaction.updateMany({
              where: {
                accountId: { in: personalAccountIds },
                linkedTransactionId: { not: null },
              },
              data: { linkedTransactionId: null },
            });

            // Unlink: other txns that point to user's personal txns → null their link
            if (personalTxnIds.length > 0) {
              await tx.transaction.updateMany({
                where: { linkedTransactionId: { in: personalTxnIds } },
                data: { linkedTransactionId: null },
              });
            }
          }

          // ── Null importBatchId on shared txns that reference user's batches ──
          const userBatchIds = await tx.importBatch
            .findMany({ where: { userId }, select: { id: true } })
            .then((rows) => rows.map((r) => r.id));

          if (userBatchIds.length > 0) {
            // Clear references on non-personal-account transactions
            await tx.transaction.updateMany({
              where: {
                importBatchId: { in: userBatchIds },
                ...(personalAccountIds.length > 0
                  ? { accountId: { notIn: personalAccountIds } }
                  : {}),
              },
              data: { importBatchId: null },
            });
          }

          // ── PHASE 3: Delete user's personal data ────────────────────

          // RecurringRule (FK to User, FinancialAccount, Household — must go before accounts)
          await tx.recurringRule.deleteMany({ where: { userId } });

          // Tracker (FK to User, Household) — TrackerAllocation and TagTrackerAllocation cascade
          await tx.tracker.deleteMany({ where: { userId } });

          // ImportProfile for personal accounts (FK to FinancialAccount — must go before accounts)
          if (personalAccountIds.length > 0) {
            await tx.importProfile.deleteMany({
              where: { accountId: { in: personalAccountIds } },
            });
          }

          // ImportBatch (FK to User)
          await tx.importBatch.deleteMany({ where: { userId } });

          // Transactions in personal accounts (TransactionTag cascades via onDelete:Cascade on Tag)
          if (personalAccountIds.length > 0) {
            await tx.transaction.deleteMany({
              where: { accountId: { in: personalAccountIds } },
            });

            // Delete personal accounts
            await tx.financialAccount.deleteMany({
              where: { id: { in: personalAccountIds } },
            });
          }

          // Tags (remaining after reassignment = personal tags + all if no partner)
          // TransactionTag and TagTrackerAllocation cascade from Tag delete
          await tx.tag.deleteMany({ where: { userId } });

          // TagGroups (remaining after reassignment)
          await tx.tagGroup.deleteMany({ where: { userId } });

          // Assets, Debts, Goals
          await tx.asset.deleteMany({ where: { userId } });
          await tx.debt.deleteMany({ where: { userId } });
          await tx.goal.deleteMany({ where: { userId } });

          // DismissedRecurringPattern (also has cascade on User, but explicit is safer)
          await tx.dismissedRecurringPattern.deleteMany({ where: { userId } });

          // OpheliaFeedback (no FK to User — stored as plain string userId)
          await tx.opheliaFeedback.deleteMany({ where: { userId } });

          // AuditLog (FK to User — must delete before User)
          await tx.auditLog.deleteMany({ where: { userId } });

          // PendingInvites sent by this user
          await tx.pendingInvite.deleteMany({ where: { invitedById: userId } });

          // HouseholdMember (FK to User and Household)
          await tx.householdMember.deleteMany({ where: { userId } });

          // NextAuth sessions and OAuth accounts
          await tx.session.deleteMany({ where: { userId } });
          await tx.account.deleteMany({ where: { userId } });

          // ── Delete the user ─────────────────────────────────────────
          await tx.user.delete({ where: { id: userId } });

          // ── PHASE 4: Household cleanup if user was the last member ──
          if (!partnerId && householdId) {
            // All household accounts (any ownership since no partner)
            const householdAccounts = await tx.financialAccount.findMany({
              where: { householdId },
              select: { id: true },
            });
            const householdAccountIds = householdAccounts.map((a) => a.id);

            if (householdAccountIds.length > 0) {
              // ImportProfiles on these accounts
              await tx.importProfile.deleteMany({
                where: { accountId: { in: householdAccountIds } },
              });
              // Transactions (TransactionTag cascades)
              await tx.transaction.deleteMany({
                where: { accountId: { in: householdAccountIds } },
              });
              // The accounts themselves
              await tx.financialAccount.deleteMany({ where: { householdId } });
            }

            // Categories (delete children before parents to avoid FK self-ref issues)
            await tx.category.deleteMany({
              where: { householdId, parentId: { not: null } },
            });
            await tx.category.deleteMany({ where: { householdId } });

            // TagGroups (remaining household-level ones with null userId)
            await tx.tagGroup.deleteMany({ where: { householdId } });

            // Household (DismissedRecurringPattern and OpheliaFeedback cascade via onDelete:Cascade)
            await tx.household.delete({ where: { id: householdId } });
          }
        },
        { timeout: 30_000 }
      );

      return { success: true };
    }),
});
