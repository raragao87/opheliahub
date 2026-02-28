import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const createTRPCContext = async () => {
  const session = await auth();
  return {
    prisma,
    session,
    userId: session?.user?.id ?? null,
  };
};

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

// ─── Auth middleware ─────────────────────────────────────────────────
const enforceAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.session.user.id,
      session: ctx.session,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceAuth);

// ─── Household middleware (extends auth) ─────────────────────────────
const enforceHousehold = enforceAuth.unstable_pipe(async ({ ctx, next }) => {
  const membership = await ctx.prisma.householdMember.findFirst({
    where: {
      userId: ctx.userId,
      inviteStatus: "ACCEPTED",
    },
    include: { household: true },
  });

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You must belong to a household to access this resource.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      householdId: membership.householdId,
      householdRole: membership.role,
      household: membership.household,
    },
  });
});

export const householdProcedure = t.procedure.use(enforceHousehold);
