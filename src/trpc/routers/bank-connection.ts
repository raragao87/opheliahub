import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, householdProcedure } from "../init";
import { visibleAccountsWhere } from "@/lib/privacy";
import { env } from "@/env";
import { listAspsps, startAuth } from "@/lib/bank/enable-banking";
import { signState } from "@/lib/bank/state";
import { syncConnection } from "@/lib/bank/sync-connection";

const MAX_CONSENT_DAYS = 180;

const ACCOUNT_TYPES = [
  "CHECKING", "CREDIT_CARD", "SAVINGS", "INVESTMENT", "CASH", "CRYPTO",
] as const;

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

export const bankConnectionRouter = router({
  /** Banks available in a country (default NL). */
  listAspsps: householdProcedure
    .input(z.object({ country: z.string().length(2).default("NL") }).optional())
    .query(async ({ input }) => {
      const aspsps = await listAspsps(input?.country ?? "NL");
      return aspsps.map((a) => ({
        name: a.name,
        country: a.country,
        logo: a.logo ?? null,
        maxConsentDays: a.maximum_consent_validity
          ? Math.floor(a.maximum_consent_validity / 86_400)
          : MAX_CONSENT_DAYS,
      }));
    }),

  /** Begin a consent flow — returns the bank URL to redirect the user to. */
  startAuth: householdProcedure
    .input(z.object({ aspspName: z.string(), aspspCountry: z.string().length(2) }))
    .mutation(async ({ ctx, input }) => {
      if (!env.ENABLE_BANKING_REDIRECT_URL) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Bank integration is not configured." });
      }
      const validUntil = new Date(Date.now() + MAX_CONSENT_DAYS * 86_400_000);
      const state = signState({
        userId: ctx.userId,
        householdId: ctx.householdId,
        aspspName: input.aspspName,
        aspspCountry: input.aspspCountry,
        validUntil: validUntil.toISOString(),
      });
      const { url } = await startAuth({
        aspspName: input.aspspName,
        aspspCountry: input.aspspCountry,
        redirectUrl: env.ENABLE_BANKING_REDIRECT_URL,
        state,
        validUntil,
      });
      return { url };
    }),

  /** The user's connections, with linked accounts and expiry info. */
  list: householdProcedure.query(async ({ ctx }) => {
    const connections = await ctx.prisma.bankConnection.findMany({
      where: { userId: ctx.userId },
      include: {
        accountLinks: {
          include: { financialAccount: { select: { id: true, name: true, icon: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return connections.map((c) => ({
      id: c.id,
      aspspName: c.aspspName,
      aspspCountry: c.aspspCountry,
      status: c.status,
      consentValidUntil: c.consentValidUntil,
      daysUntilExpiry: daysUntil(c.consentValidUntil),
      links: c.accountLinks.map((l) => ({
        id: l.id,
        financialAccountId: l.financialAccountId,
        accountName: l.financialAccount.name,
        accountIcon: l.financialAccount.icon,
        displayName: l.displayName,
        lastSyncedAt: l.lastSyncedAt,
      })),
    }));
  }),

  /** The accounts the bank authorized (captured at consent time), annotated
   *  with whether each is already linked to an OpheliaHub account. */
  getDiscoveredAccounts: householdProcedure
    .input(z.object({ connectionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const connection = await ctx.prisma.bankConnection.findFirst({
        where: { id: input.connectionId, userId: ctx.userId },
        include: { accountLinks: true },
      });
      if (!connection) throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found." });

      const linkedExternalIds = new Set(connection.accountLinks.map((l) => l.externalAccountId));
      const discovered = (connection.discoveredAccounts ?? []) as Array<{
        uid: string; name?: string; iban?: string; currency?: string;
      }>;
      return discovered.map((d) => ({ ...d, alreadyLinked: linkedExternalIds.has(d.uid) }));
    }),

  /** Link discovered bank accounts to existing or new OpheliaHub accounts. */
  mapAccounts: householdProcedure
    .input(
      z.object({
        connectionId: z.string(),
        mappings: z.array(
          z.object({
            externalAccountId: z.string(),
            iban: z.string().optional(),
            displayName: z.string().optional(),
            currency: z.string().length(3).optional(),
            financialAccountId: z.string().optional(),
            createNew: z.object({ name: z.string().min(1), type: z.enum(ACCOUNT_TYPES) }).optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const connection = await ctx.prisma.bankConnection.findFirst({
        where: { id: input.connectionId, userId: ctx.userId },
      });
      if (!connection) throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found." });

      for (const m of input.mappings) {
        let financialAccountId = m.financialAccountId;

        if (m.createNew) {
          const created = await ctx.prisma.financialAccount.create({
            data: {
              name: m.createNew.name,
              type: m.createNew.type,
              ownership: "PERSONAL",
              currency: m.currency ?? "EUR",
              institution: connection.aspspName,
              ownerId: ctx.userId,
            },
          });
          financialAccountId = created.id;
        } else if (financialAccountId) {
          // Privacy + ownership gate: target must be visible to the user.
          const target = await ctx.prisma.financialAccount.findFirst({
            where: { id: financialAccountId, ...visibleAccountsWhere(ctx.userId, ctx.householdId) },
          });
          if (!target) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Cannot link to that account." });
          }
        } else {
          continue; // nothing to do for this discovered account
        }

        await ctx.prisma.bankAccountLink.upsert({
          where: { bankConnectionId_externalAccountId: { bankConnectionId: connection.id, externalAccountId: m.externalAccountId } },
          create: {
            bankConnectionId: connection.id,
            externalAccountId: m.externalAccountId,
            financialAccountId: financialAccountId!,
            iban: m.iban,
            displayName: m.displayName,
          },
          update: { financialAccountId: financialAccountId!, iban: m.iban, displayName: m.displayName },
        });
      }
      return { mapped: input.mappings.length };
    }),

  /** Manual sync. Runs without PSU headers (the tRPC context has no request),
   *  so it shares the 4/day background rate limit — fine for occasional use. */
  syncNow: householdProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const connection = await ctx.prisma.bankConnection.findFirst({
        where: { id: input.connectionId, userId: ctx.userId },
      });
      if (!connection) throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found." });
      return syncConnection(ctx.prisma, connection, ctx.householdId);
    }),

  /** Whether the user has any active connection — gates the sidebar sync button. */
  hasActiveConnections: householdProcedure.query(async ({ ctx }) => {
    const count = await ctx.prisma.bankConnection.count({
      where: { userId: ctx.userId, status: "ACTIVE" },
    });
    return count > 0;
  }),

  /** Sync every active connection at once (sidebar "sync all"). */
  syncAll: householdProcedure.mutation(async ({ ctx }) => {
    const connections = await ctx.prisma.bankConnection.findMany({
      where: { userId: ctx.userId, status: "ACTIVE" },
    });
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const connection of connections) {
      const r = await syncConnection(ctx.prisma, connection, ctx.householdId);
      imported += r.imported;
      skipped += r.skipped;
      if (r.errors.length > 0) errors.push(`${connection.aspspName}: ${r.errors.join("; ")}`);
    }
    return { connections: connections.length, imported, skipped, errors };
  }),

  /** Disconnect — keeps synced transactions + accounts; frees the links. */
  disconnect: householdProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const connection = await ctx.prisma.bankConnection.findFirst({
        where: { id: input.connectionId, userId: ctx.userId },
      });
      if (!connection) throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found." });
      await ctx.prisma.bankAccountLink.deleteMany({ where: { bankConnectionId: connection.id } });
      await ctx.prisma.bankConnection.update({
        where: { id: connection.id },
        data: { status: "REVOKED" },
      });
      return { success: true };
    }),
});
