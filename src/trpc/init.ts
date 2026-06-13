import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Household, HouseholdRole } from "@prisma/client";
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

// ─── Household membership cache ──────────────────────────────────────
// A batch of N household procedures used to run N identical membership
// lookups before any work began. Cache the result per warm serverless
// instance for a short TTL so a batch pays one query (or zero, warm).
// Membership rarely changes; mutations that DO change it call
// invalidateMembership() to drop the affected user's entry immediately.
type CachedMembership = {
  householdId: string;
  role: HouseholdRole;
  household: Household;
};
const MEMBERSHIP_TTL_MS = 60_000;
const membershipCache = new Map<string, { value: CachedMembership; expires: number }>();

export function invalidateMembership(userId: string) {
  membershipCache.delete(userId);
}

// ─── Household middleware (extends auth) ─────────────────────────────
const enforceHousehold = enforceAuth.unstable_pipe(async ({ ctx, next }) => {
  const cached = membershipCache.get(ctx.userId);
  let value: CachedMembership;

  if (cached && cached.expires > Date.now()) {
    value = cached.value;
  } else {
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

    value = {
      householdId: membership.householdId,
      role: membership.role,
      household: membership.household,
    };
    membershipCache.set(ctx.userId, { value, expires: Date.now() + MEMBERSHIP_TTL_MS });
  }

  return next({
    ctx: {
      ...ctx,
      householdId: value.householdId,
      householdRole: value.role,
      household: value.household,
    },
  });
});

export const householdProcedure = t.procedure.use(enforceHousehold);
