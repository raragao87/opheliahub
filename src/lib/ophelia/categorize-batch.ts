import "server-only";
import type { PrismaClient } from "@prisma/client";
import { enrichTransactions } from "./enrichTransactions";
import { isOpheliaEnabled } from "./provider";

const DEFAULT_BATCH_SIZE = 200;
const REPROCESS_AFTER_DAYS = 7;

export interface CategorizeBatchResult {
  processed: number;
  skipped: number;
  errors: number;
  /** True when the batch was full — caller should inform the user there are more to process. */
  hasMore: boolean;
}

/**
 * Runs Ophelia background categorization for one or all households.
 *
 * - If `householdId` is provided, only that household is processed.
 * - If omitted, all households with unprocessed transactions are processed.
 * - Only sends transaction descriptions to the AI — no IBANs, names, or account numbers.
 * - Never overwrites the user-set `categoryId` — only writes to `opheliaCategoryId`.
 * - Sets `opheliaProcessedAt = now()` on every processed transaction.
 * - Transactions where `opheliaProcessedAt IS NULL` are processed first.
 * - Transactions processed more than REPROCESS_AFTER_DAYS ago are eligible for re-processing.
 */
export async function categorizeTransactionBatch(
  prisma: PrismaClient,
  householdId?: string,
  batchSize = DEFAULT_BATCH_SIZE
): Promise<CategorizeBatchResult> {
  const opheliaEnabled = isOpheliaEnabled();
  console.log(`[Ophelia] categorizeTransactionBatch — enabled=${opheliaEnabled}, householdId=${householdId ?? "all"}`);
  if (!opheliaEnabled) return { processed: 0, skipped: 0, errors: 0, hasMore: false };

  const reprocessBefore = new Date(
    Date.now() - REPROCESS_AFTER_DAYS * 24 * 60 * 60 * 1000
  );

  // Resolve which households to process
  let householdIds: string[];
  if (householdId) {
    householdIds = [householdId];
  } else {
    const memberships = await prisma.householdMember.findMany({
      where: { inviteStatus: "ACCEPTED" },
      select: { householdId: true },
      distinct: ["householdId"],
    });
    householdIds = memberships.map((m) => m.householdId);
  }

  console.log(`[Ophelia] households to process: [${householdIds.join(", ")}]`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const hid of householdIds) {
    try {
      // Get all accepted member user IDs for this household
      const members = await prisma.householdMember.findMany({
        where: { householdId: hid, inviteStatus: "ACCEPTED" },
        select: { userId: true },
      });
      const memberUserIds = members.map((m) => m.userId);
      console.log(`[Ophelia] household ${hid} — ${memberUserIds.length} member(s): [${memberUserIds.join(", ")}]`);

      // Find unprocessed (or stale) transactions for this household.
      // Scope: shared accounts of this household + personal accounts owned by household members.
      // Privacy: only description + amount + date are sent to the AI — no IBAN, no user name.
      //
      // A transaction needs (re)processing if ANY of these are true:
      //   1. opheliaProcessedAt IS NULL           → never processed
      //   2. opheliaProcessedAt < reprocessBefore → processed > 7 days ago → refresh suggestion
      //
      // NOTE: Condition "processed but got no suggestion → retry immediately" is intentionally
      // removed. Failed transactions are now stamped with opheliaProcessedAt so they don't
      // retry until the 7-day reprocess window. This prevents infinite retry loops.
      const transactions = await prisma.transaction.findMany({
        where: {
          isInitialBalance: false,
          OR: [
            { opheliaProcessedAt: null },                    // 1. never processed
            { opheliaProcessedAt: { lt: reprocessBefore } }, // 2. processed > 7 days ago
          ],
          account: {
            OR: [
              { householdId: hid },
              { ownerId: { in: memberUserIds }, householdId: null },
            ],
          },
        },
        select: {
          id: true,
          description: true,
          amount: true,
          date: true,
        },
        take: batchSize,
        orderBy: { opheliaProcessedAt: "asc" }, // null comes first
      });

      console.log(`[Ophelia] household ${hid} — query found ${transactions.length} transaction(s) to process (batch size ${batchSize})`);

      if (transactions.length === 0) {
        skipped++;
        continue;
      }

      // Fetch all leaf categories for this household (both SHARED and PERSONAL)
      const categories = await prisma.category.findMany({
        where: {
          householdId: hid,
          parentId: { not: null },
        },
        select: { id: true, name: true, parent: { select: { name: true } } },
        orderBy: [{ parent: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      });

      // Fetch all non-archived tags visible to household members
      const tags = await prisma.tag.findMany({
        where: {
          isArchived: false,
          OR: [
            { visibility: "SHARED" },
            { visibility: "PERSONAL", userId: { in: memberUserIds } },
          ],
        },
        select: { id: true, name: true, group: { select: { name: true } } },
        orderBy: { sortOrder: "asc" },
      });

      // Fetch up to 20 recently user-categorized transactions as few-shot examples
      const recentExamples = await prisma.transaction.findMany({
        where: {
          categoryId: { not: null },
          account: {
            OR: [
              { householdId: hid },
              { ownerId: { in: memberUserIds } },
            ],
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          description: true,
          displayName: true,
          category: { select: { name: true } },
          tags: { select: { tag: { select: { name: true } } } },
        },
      });

      // Fetch recent user corrections as high-priority examples.
      // Corrections come first in the prompt — they represent explicit preferences.
      const recentCorrections = await prisma.opheliaFeedback.findMany({
        where: { householdId: hid },
        orderBy: [{ wasCorrection: "desc" }, { createdAt: "desc" }],
        take: 20,
        select: {
          transactionDescription: true,
          opheliaCategoryName: true,
          userCategoryName: true,
          userDisplayName: true,
          wasCorrection: true,
        },
      });

      // Build correction examples — formatted as explicit override instructions
      const correctionExamples = recentCorrections
        .filter((c) => c.userCategoryName !== null)
        .map((c) => ({
          description: c.transactionDescription,
          categoryName: c.userCategoryName!,
          displayName: c.userDisplayName ?? c.transactionDescription,
          tags: [] as string[],
          note: c.wasCorrection
            ? `USER CORRECTION: do NOT use "${c.opheliaCategoryName}" for this`
            : undefined,
        }));

      // Call the Ophelia AI — only descriptions go to the AI
      const results = await enrichTransactions({
        transactions: transactions.map((tx) => ({
          date: tx.date.toISOString().slice(0, 10),
          description: tx.description,
          amount: tx.amount,
        })),
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          parentName: c.parent?.name ?? undefined,
        })),
        tags: tags.map((t) => ({
          id: t.id,
          name: t.name,
          groupName: t.group?.name ?? undefined,
        })),
        // Corrections first (highest priority), then general examples
        recentExamples: [
          ...correctionExamples,
          ...recentExamples
            .filter((t) => t.category !== null)
            .map((t) => ({
              description: t.description,
              categoryName: t.category!.name,
              displayName: t.displayName ?? t.description,
              tags: t.tags.map((tt) => tt.tag.name),
            })),
        ].slice(0, 20),
      });

      const now = new Date();

      if (!results) {
        // AI call failed — stamp all transactions so they don't retry until the 7-day window.
        // This is CRITICAL to prevent infinite retry loops.
        console.error(`[Ophelia] enrichTransactions returned null for household ${hid} — stamping ${transactions.length} transactions as processed (failed)`);
        const failedIds = transactions.map((tx) => tx.id);
        await prisma.transaction.updateMany({
          where: { id: { in: failedIds } },
          data: {
            opheliaProcessedAt: now,
            opheliaCategoryId: null,
            opheliaConfidence: null,
            opheliaDisplayName: null,
          },
        });
        errors += transactions.length;
        continue;
      }

      // Write back Ophelia suggestions for each transaction.
      // IMPORTANT: never touch categoryId — that's the user's domain.
      // When enrichTransactions returns partial results (some batches failed), transactions
      // without a matching result still get stamped so they don't loop endlessly.
      const resultMap = new Map(results.map((r) => [r.index, r]));

      for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        const result = resultMap.get(i);

        try {
          await prisma.transaction.update({
            where: { id: tx.id },
            data: {
              opheliaCategoryId: result?.suggestedCategoryId ?? null,
              opheliaConfidence: result?.categoryConfidence ?? null,
              opheliaDisplayName: result?.suggestedDisplayName ?? null,
              opheliaProcessedAt: now,
            },
          });
          if (result) {
            processed++;
          } else {
            // No result for this transaction (its batch failed) — stamped but counted as error
            errors++;
          }
        } catch (updateErr) {
          console.error(`[Ophelia] Failed to update transaction ${tx.id}:`, updateErr);
          errors++;
        }
      }
      // ── Feedback cleanup ────────────────────────────────────────────
      // Keep only the most recent 500 feedback records per household
      // to prevent unbounded table growth.
      const feedbackCount = await prisma.opheliaFeedback.count({
        where: { householdId: hid },
      });
      if (feedbackCount > 500) {
        // Find the cutoff record (500th most recent)
        const cutoff = await prisma.opheliaFeedback.findMany({
          where: { householdId: hid },
          orderBy: { createdAt: "desc" },
          skip: 500,
          take: 1,
          select: { createdAt: true },
        });
        if (cutoff[0]) {
          await prisma.opheliaFeedback.deleteMany({
            where: { householdId: hid, createdAt: { lte: cutoff[0].createdAt } },
          });
        }
      }
    } catch (err) {
      console.error(`[Ophelia] categorizeTransactionBatch error for household ${hid}:`, err);
      errors++;
    }
  }

  // hasMore: true when the query returned a full batch for at least one household —
  // means there are likely more transactions that didn't fit in this run.
  const hasMore = processed > 0 && processed >= batchSize;
  return { processed, skipped, errors, hasMore };
}
