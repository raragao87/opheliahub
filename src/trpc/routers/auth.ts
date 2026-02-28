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
});
