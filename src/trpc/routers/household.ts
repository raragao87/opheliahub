import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, householdProcedure } from "../init";
import { seedDefaultCategories } from "../../lib/seed-categories";

export const householdRouter = router({
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // Check if user already belongs to a household
      const existing = await ctx.prisma.householdMember.findFirst({
        where: { userId: ctx.userId, inviteStatus: "ACCEPTED" },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already belong to a household.",
        });
      }

      const household = await ctx.prisma.household.create({
        data: {
          name: input.name,
          members: {
            create: {
              userId: ctx.userId,
              role: "OWNER",
              inviteStatus: "ACCEPTED",
              joinedAt: new Date(),
            },
          },
        },
      });

      // Seed default categories
      await seedDefaultCategories(ctx.prisma, household.id);

      return household;
    }),

  get: householdProcedure.query(async ({ ctx }) => {
    return ctx.prisma.household.findUnique({
      where: { id: ctx.householdId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
      },
    });
  }),

  invite: householdProcedure
    .input(z.object({ email: z.email() }))
    .mutation(async ({ ctx, input }) => {
      // Check if already invited or member
      const existingMember = await ctx.prisma.householdMember.findFirst({
        where: {
          householdId: ctx.householdId,
          OR: [
            { inviteEmail: input.email },
            { user: { email: input.email } },
          ],
        },
      });

      if (existingMember) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This person is already invited or a member.",
        });
      }

      // Find user by email or create a placeholder membership
      const invitedUser = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });

      if (invitedUser) {
        return ctx.prisma.householdMember.create({
          data: {
            householdId: ctx.householdId,
            userId: invitedUser.id,
            role: "PARTNER",
            inviteStatus: "PENDING",
            inviteEmail: input.email,
          },
        });
      }

      // User doesn't exist yet — create a pending invite record
      // When they sign up, auth.ts will link it to their account
      return ctx.prisma.pendingInvite.create({
        data: {
          householdId: ctx.householdId,
          email: input.email,
          invitedById: ctx.userId,
        },
      });
    }),

  getPendingInviteInfo: protectedProcedure.query(async ({ ctx }) => {
    const pending = await ctx.prisma.householdMember.findFirst({
      where: { userId: ctx.userId, inviteStatus: "PENDING" },
      include: {
        household: {
          include: {
            members: {
              where: { role: "OWNER" },
              include: {
                user: { select: { name: true, email: true, image: true } },
              },
            },
          },
        },
      },
    });

    if (!pending) return null;

    const owner = pending.household.members[0]?.user;
    return {
      householdName: pending.household.name,
      invitedByName: owner?.name ?? "Someone",
      invitedByEmail: owner?.email ?? "",
      invitedByImage: owner?.image ?? null,
    };
  }),

  acceptInvite: protectedProcedure.mutation(async ({ ctx }) => {
    const pending = await ctx.prisma.householdMember.findFirst({
      where: {
        userId: ctx.userId,
        inviteStatus: "PENDING",
      },
    });

    if (!pending) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No pending invitation found.",
      });
    }

    return ctx.prisma.householdMember.update({
      where: { id: pending.id },
      data: {
        inviteStatus: "ACCEPTED",
        joinedAt: new Date(),
      },
    });
  }),

  rejectInvite: protectedProcedure.mutation(async ({ ctx }) => {
    const pending = await ctx.prisma.householdMember.findFirst({
      where: {
        userId: ctx.userId,
        inviteStatus: "PENDING",
      },
    });

    if (!pending) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No pending invitation found.",
      });
    }

    return ctx.prisma.householdMember.update({
      where: { id: pending.id },
      data: { inviteStatus: "REJECTED" },
    });
  }),
});
