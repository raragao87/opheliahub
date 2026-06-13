/**
 * Shared transaction-commit core.
 *
 * Extracted from the import router's `commit` mutation so BOTH the manual
 * CSV/MT940 import AND the automatic bank sync write transactions the same
 * way — same balance update, same ImportBatch, same Ophelia categorization
 * and post-import duplicate hooks.
 *
 * The CSV path passes `skipExistingExternalIds: false` and is byte-for-byte
 * identical to the previous behavior. The bank-sync path passes `true`, which
 * adds an exact externalId dedup (bank transaction ids are stable).
 */
import type { PrismaClient, ImportFormat, AccountType } from "@prisma/client";
import { ACCOUNT_TYPE_META } from "@/lib/account-types";
import { extractDisplayName } from "@/lib/recurring";
import { computeEffectiveCategoryId } from "@/lib/effective-category";
import { isOpheliaEnabled } from "@/lib/ophelia";
import { descriptionsMatch } from "@/lib/duplicate-matching";
import { categorizeTransactionBatch } from "@/lib/ophelia/categorize-batch";
import { checkPostImportDuplicates } from "@/lib/ophelia/check-post-import-duplicates";

export interface CommitRow {
  date: Date;
  description: string;
  displayName?: string;
  amount: number; // cents
  type: "INCOME" | "EXPENSE" | "FUND" | "TRANSFER" | "INVESTMENT";
  currency?: string;
  categoryId?: string;
  tagIds?: string[];
  externalId?: string;
}

export interface CommitArgs {
  userId: string;
  householdId: string;
  accountId: string;
  account: { type: AccountType; currency: string };
  fileName: string;
  format: ImportFormat;
  profileId?: string;
  rows: CommitRow[];
  /** Bank sync: skip rows whose externalId already exists on the account. */
  skipExistingExternalIds?: boolean;
}

export async function commitTransactions(
  prisma: PrismaClient,
  args: CommitArgs
): Promise<{ batchId: string; importedRows: number; skippedRows: number }> {
  const { userId, householdId, accountId, account } = args;

  // Dedup for bank sync. Two layers, because the bank's transaction id won't
  // match rows imported earlier from CSV (which have a different/absent id):
  //   1. exact externalId match (cheap, handles repeat syncs of bank rows)
  //   2. fuzzy match against existing rows by amount + date(±1d) + description
  //      — catches the first sync overlapping manual imports, so it doesn't
  //      re-import what's already there. One-to-one: each existing row absorbs
  //      at most one incoming row.
  let rowsToImport = args.rows;
  if (args.skipExistingExternalIds) {
    const dates = args.rows.map((r) => r.date.getTime());
    const lo = new Date(Math.min(...dates) - 3 * 86_400_000);
    const hi = new Date(Math.max(...dates) + 3 * 86_400_000);
    const ids = args.rows.map((r) => r.externalId).filter((id): id is string => !!id);

    const existing = await prisma.transaction.findMany({
      where: {
        accountId,
        deletedAt: null,
        OR: [
          ...(ids.length ? [{ externalId: { in: ids } }] : []),
          { date: { gte: lo, lte: hi } },
        ],
      },
      select: { externalId: true, date: true, amount: true, description: true, displayName: true },
    });

    const existingExternalIds = new Set(existing.map((e) => e.externalId).filter((x): x is string => !!x));
    const fuzzyPool = existing.map((e) => ({ ...e, used: false }));

    rowsToImport = args.rows.filter((r) => {
      if (r.externalId && existingExternalIds.has(r.externalId)) return false; // layer 1
      // ±4 days: banks book a transfer on a different date than an earlier
      // CSV export showed it (settlement vs initiation).
      const match = fuzzyPool.find(
        (e) =>
          !e.used &&
          e.amount === r.amount &&
          Math.abs(e.date.getTime() - r.date.getTime()) <= 4 * 86_400_000 &&
          (descriptionsMatch(r.description, e.description) ||
            (e.displayName ? descriptionsMatch(r.description, e.displayName) : false))
      );
      if (match) {
        match.used = true; // layer 2 — consume so two new rows can't both match it
        return false;
      }
      return true;
    });
  }
  const skippedRows = args.rows.length - rowsToImport.length;

  const result = await prisma.$transaction(
    async (tx) => {
      const batch = await tx.importBatch.create({
        data: {
          fileName: args.fileName,
          format: args.format,
          status: "PROCESSING",
          totalRows: args.rows.length,
          userId,
          accountId,
          profileId: args.profileId,
        },
      });

      let importedRows = 0;
      let balanceChange = 0;

      const isInvestmentAccount = ACCOUNT_TYPE_META[account.type]?.sidebarGroup === "INVESTMENT";

      for (const txData of rowsToImport) {
        const { tagIds = [], displayName: clientDisplayName, currency: txCurrency, ...transactionData } = txData;

        // Auto-type INVESTMENT for investment accounts (except transfers)
        if (isInvestmentAccount && transactionData.type !== "TRANSFER") {
          transactionData.type = "INVESTMENT";
        }

        const created = await tx.transaction.create({
          data: {
            ...transactionData,
            currency: txCurrency || account.currency || "EUR",
            displayName: clientDisplayName || extractDisplayName(transactionData.description),
            originalDescription: transactionData.description,
            accountId,
            userId,
            importBatchId: batch.id,
            effectiveCategoryId: computeEffectiveCategoryId(transactionData.categoryId ?? null, null),
            tags: tagIds.length > 0 ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
          },
        });

        balanceChange += created.amount;
        importedRows++;
      }

      await tx.financialAccount.update({
        where: { id: accountId },
        data: { balance: { increment: balanceChange } },
      });

      await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: "COMPLETED", importedRows },
      });

      return { batchId: batch.id, importedRows };
    },
    { timeout: 60_000 }
  );

  // Fire-and-forget: Ophelia categorization + post-import duplicate safety net.
  // Gated only on isOpheliaEnabled() — identical to the original CSV path.
  if (isOpheliaEnabled()) {
    categorizeTransactionBatch(prisma, householdId, 50).catch((err) =>
      console.error("[Ophelia] Post-import categorization error:", err)
    );
    checkPostImportDuplicates(prisma, userId, householdId, accountId, result.batchId).catch((err) =>
      console.error("[Ophelia] Post-import duplicate check error:", err)
    );
  }

  return { ...result, skippedRows };
}
