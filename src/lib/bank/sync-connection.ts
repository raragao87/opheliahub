/**
 * Sync one bank connection's linked accounts into OpheliaHub.
 *
 * Shared by the manual "Sync now" mutation and the daily cron. Fetches
 * transactions since each link's lastSyncedAt (first sync: last 90 days),
 * transforms them, and routes them through the shared commit core — which
 * dedups on the stable bank externalId and fires the categorize + duplicate
 * hooks. Flips the connection to EXPIRED when consent has lapsed.
 */
import type { PrismaClient, BankConnection } from "@prisma/client";
import { getTransactions, type PsuHeaders } from "./enable-banking";
import { transformBankTransactions } from "./transform";
import { commitTransactions } from "@/lib/import/commit-transactions";

const FIRST_SYNC_LOOKBACK_DAYS = 90;

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface SyncResult {
  accountsSynced: number;
  imported: number;
  skipped: number;
  errors: string[];
}

export async function syncConnection(
  prisma: PrismaClient,
  connection: BankConnection,
  householdId: string,
  opts: { psu?: PsuHeaders } = {}
): Promise<SyncResult> {
  const result: SyncResult = { accountsSynced: 0, imported: 0, skipped: 0, errors: [] };

  // Consent lapsed → mark EXPIRED and stop.
  if (connection.consentValidUntil.getTime() < Date.now()) {
    await prisma.bankConnection.update({
      where: { id: connection.id },
      data: { status: "EXPIRED" },
    });
    result.errors.push("Consent expired");
    return result;
  }

  const links = await prisma.bankAccountLink.findMany({
    where: { bankConnectionId: connection.id },
    include: { financialAccount: { select: { id: true, type: true, currency: true } } },
  });

  for (const link of links) {
    try {
      // First sync of an account that already has transactions (e.g. months of
      // manual CSV imports): start from its most recent existing transaction
      // instead of 90 days back, so we don't re-pull — and re-dedup — the whole
      // overlap. Empty accounts fall back to the 90-day backfill. The fuzzy
      // dedup in commitTransactions still guards the boundary day.
      let dateFrom: string;
      if (link.lastSyncedAt) {
        dateFrom = toDateOnly(link.lastSyncedAt);
      } else {
        const latest = await prisma.transaction.findFirst({
          where: { accountId: link.financialAccountId, deletedAt: null },
          orderBy: { date: "desc" },
          select: { date: true },
        });
        const lookback = new Date(Date.now() - FIRST_SYNC_LOOKBACK_DAYS * 86_400_000);
        dateFrom = toDateOnly(latest && latest.date > lookback ? latest.date : lookback);
      }

      const raw = await getTransactions(link.externalAccountId, dateFrom, opts.psu);
      const rows = transformBankTransactions(raw);

      if (rows.length > 0) {
        const commit = await commitTransactions(prisma, {
          userId: connection.userId,
          householdId,
          accountId: link.financialAccountId,
          account: { type: link.financialAccount.type, currency: link.financialAccount.currency },
          fileName: `${connection.aspspName} ${dateFrom}`,
          format: "OPENBANKING",
          rows,
          skipExistingExternalIds: true,
        });
        result.imported += commit.importedRows;
        result.skipped += commit.skippedRows;
      }

      await prisma.bankAccountLink.update({
        where: { id: link.id },
        data: { lastSyncedAt: new Date() },
      });
      result.accountsSynced++;
    } catch (err) {
      const e = err as Error & { status?: number };
      result.errors.push(`${link.externalAccountId}: ${e.message}`);
      // Auth/consent failure → connection no longer usable.
      if (e.status === 401 || e.status === 403) {
        await prisma.bankConnection.update({
          where: { id: connection.id },
          data: { status: "EXPIRED" },
        });
        break;
      }
    }
  }

  return result;
}
