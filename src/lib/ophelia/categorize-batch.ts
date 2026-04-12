import "server-only";
import type { PrismaClient } from "@prisma/client";
import { extractDisplayName } from "@/lib/recurring";
import { enrichTransactions } from "./enrichTransactions";
import { isOpheliaEnabled } from "./provider";
import { computeEffectiveCategoryId } from "@/lib/effective-category";

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
          type: { not: "TRANSFER" },
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
          displayName: true,
          amount: true,
          date: true,
          visibility: true,
          categoryId: true,
        },
        take: batchSize,
        orderBy: { opheliaProcessedAt: "asc" }, // null comes first
      });

      console.log(`[Ophelia] household ${hid} — query found ${transactions.length} transaction(s) to process (batch size ${batchSize})`);

      if (transactions.length === 0) {
        skipped++;
        continue;
      }

      // Fetch all leaf categories for this household, with visibility
      const categories = await prisma.category.findMany({
        where: {
          householdId: hid,
          parentId: { not: null },
        },
        select: { id: true, name: true, visibility: true, parent: { select: { name: true } } },
        orderBy: [{ parent: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      });

      // Split categories by visibility so transactions only see matching categories
      const sharedCategories = categories.filter((c) => c.visibility === "SHARED");
      const personalCategories = categories.filter((c) => c.visibility === "PERSONAL");

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

      // Split transactions by visibility and call Ophelia with matching categories
      const sharedTxns = transactions.filter((t) => t.visibility === "SHARED");
      const personalTxns = transactions.filter((t) => t.visibility === "PERSONAL");

      const examples = [
        ...correctionExamples,
        ...recentExamples
          .filter((t) => t.category !== null)
          .map((t) => ({
            description: t.description,
            categoryName: t.category!.name,
            displayName: t.displayName ?? t.description,
            tags: t.tags.map((tt) => tt.tag.name),
          })),
      ].slice(0, 20);

      const tagList = tags.map((t) => ({
        id: t.id,
        name: t.name,
        groupName: t.group?.name ?? undefined,
      }));

      const callEnrich = async (
        txns: typeof transactions,
        cats: typeof categories,
      ) => {
        if (txns.length === 0) return null;
        return enrichTransactions({
          transactions: txns.map((tx) => ({
            date: tx.date.toISOString().slice(0, 10),
            description: tx.description,
            amount: tx.amount,
          })),
          categories: cats.map((c) => ({
            id: c.id,
            name: c.name,
            parentName: c.parent?.name ?? undefined,
          })),
          tags: tagList,
          recentExamples: examples,
        });
      };

      // Run both visibility batches (in parallel if both exist)
      const [sharedResults, personalResults] = await Promise.all([
        callEnrich(sharedTxns, sharedCategories),
        callEnrich(personalTxns, personalCategories),
      ]);

      // Merge results back into a single map keyed by transaction index in the original array
      type EnrichResult = NonNullable<Awaited<ReturnType<typeof enrichTransactions>>>[number];
      const resultMap = new Map<number, EnrichResult>();
      let anyFailed = false;

      if (sharedTxns.length > 0) {
        if (sharedResults) {
          for (const r of sharedResults) {
            const origIdx = transactions.indexOf(sharedTxns[r.index]);
            if (origIdx >= 0) resultMap.set(origIdx, { ...r, index: origIdx });
          }
        } else { anyFailed = true; }
      }
      if (personalTxns.length > 0) {
        if (personalResults) {
          for (const r of personalResults) {
            const origIdx = transactions.indexOf(personalTxns[r.index]);
            if (origIdx >= 0) resultMap.set(origIdx, { ...r, index: origIdx });
          }
        } else { anyFailed = true; }
      }

      // Treat as full failure only if both batches failed
      const results = resultMap.size > 0 ? Array.from(resultMap.values()) : (anyFailed ? null : []);

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
      // Validation is per-visibility so a hallucinated cross-visibility ID is rejected.
      const validSharedCategoryIds = new Set(sharedCategories.map((c) => c.id));
      const validPersonalCategoryIds = new Set(personalCategories.map((c) => c.id));
      const validCategoryIdsFor = (vis: string) =>
        vis === "SHARED" ? validSharedCategoryIds : validPersonalCategoryIds;

      // Track transactions where AI returned an invalid category ID — these get a retry pass.
      const retryNeeded: Array<{ tx: (typeof transactions)[number]; localIndex: number }> = [];

      for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        const result = resultMap.get(i);

        // Validate the suggested category ID — AI sometimes returns hallucinated IDs.
        // Check against the visibility-scoped set so cross-visibility IDs are rejected.
        const validIds = validCategoryIdsFor(tx.visibility);
        const hasInvalidCategory =
          !!result?.suggestedCategoryId && !validIds.has(result.suggestedCategoryId);
        const safeCategoryId = hasInvalidCategory ? null : (result?.suggestedCategoryId ?? null);

        if (hasInvalidCategory) {
          console.warn(
            `[Ophelia] Invalid suggestedCategoryId "${result!.suggestedCategoryId}" for tx ${tx.id} — queuing retry`
          );
          retryNeeded.push({ tx, localIndex: retryNeeded.length });
        }

        // Determine if we should auto-apply the Ophelia display name.
        // Auto-apply when the user hasn't manually set a custom name.
        const autoExtractedName = extractDisplayName(tx.description);
        const userHasCustomName = tx.displayName !== null
          && tx.displayName !== autoExtractedName
          && tx.displayName !== tx.description;
        const shouldAutoApplyDisplayName =
          result?.suggestedDisplayName
          && !userHasCustomName
          && result.suggestedDisplayName.length > 0;

        try {
          await prisma.transaction.update({
            where: { id: tx.id },
            data: {
              opheliaCategoryId: safeCategoryId,
              opheliaConfidence: safeCategoryId && result?.categoryConfidence != null ? Math.round(result.categoryConfidence * 1000) : null,
              opheliaDisplayName: result?.suggestedDisplayName ?? null,
              opheliaProcessedAt: now,
              effectiveCategoryId: computeEffectiveCategoryId(tx.categoryId, safeCategoryId),
              ...(shouldAutoApplyDisplayName ? { displayName: result!.suggestedDisplayName } : {}),
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

      // ── Retry pass for invalid category suggestions ──────────────────────────
      // Re-runs enrichment for the subset that got hallucinated IDs and patches
      // just the opheliaCategoryId field if the retry returns a valid ID.
      if (retryNeeded.length > 0) {
        console.log(`[Ophelia] Retrying categorization for ${retryNeeded.length} transaction(s) with invalid category suggestions`);
        // Split retries by visibility too
        const retryShared = retryNeeded.filter(({ tx }) => tx.visibility === "SHARED");
        const retryPersonal = retryNeeded.filter(({ tx }) => tx.visibility === "PERSONAL");

        const [retrySharedResults, retryPersonalResults] = await Promise.all([
          retryShared.length > 0 ? enrichTransactions({
            transactions: retryShared.map(({ tx }) => ({
              date: tx.date.toISOString().slice(0, 10),
              description: tx.description,
              amount: tx.amount,
            })),
            categories: sharedCategories.map((c) => ({ id: c.id, name: c.name, parentName: c.parent?.name ?? undefined })),
            tags: tagList,
            recentExamples: examples,
          }) : Promise.resolve(null),
          retryPersonal.length > 0 ? enrichTransactions({
            transactions: retryPersonal.map(({ tx }) => ({
              date: tx.date.toISOString().slice(0, 10),
              description: tx.description,
              amount: tx.amount,
            })),
            categories: personalCategories.map((c) => ({ id: c.id, name: c.name, parentName: c.parent?.name ?? undefined })),
            tags: tagList,
            recentExamples: examples,
          }) : Promise.resolve(null),
        ]);

        // Merge retry results
        const retryResultMap = new Map<number, { suggestedCategoryId?: string | null; categoryConfidence?: number | null }>();
        if (retrySharedResults) {
          for (const r of retrySharedResults) {
            const entry = retryShared[r.index];
            if (entry) retryResultMap.set(entry.localIndex, r);
          }
        }
        if (retryPersonalResults) {
          for (const r of retryPersonalResults) {
            const entry = retryPersonal[r.index];
            if (entry) retryResultMap.set(entry.localIndex, r);
          }
        }
        const retryResults = retryResultMap.size > 0 ? retryResultMap : null;

        if (retryResults) {
          for (const { tx, localIndex } of retryNeeded) {
            const retryResult = retryResults.get(localIndex);
            const retryId = retryResult?.suggestedCategoryId;
            if (retryId && validCategoryIdsFor(tx.visibility).has(retryId)) {
              try {
                await prisma.transaction.update({
                  where: { id: tx.id },
                  data: {
                    opheliaCategoryId: retryId,
                    opheliaConfidence: retryResult?.categoryConfidence != null ? Math.round(retryResult.categoryConfidence * 1000) : null,
                    effectiveCategoryId: computeEffectiveCategoryId(tx.categoryId, retryId),
                  },
                });
                console.log(`[Ophelia] Retry success for tx ${tx.id} — category: ${retryId}`);
              } catch (retryErr) {
                console.error(`[Ophelia] Retry update failed for tx ${tx.id}:`, retryErr);
              }
            } else if (retryId) {
              console.warn(`[Ophelia] Retry also returned invalid category "${retryId}" for tx ${tx.id} — leaving uncategorized`);
            }
          }
        } else {
          console.warn(`[Ophelia] Retry enrichment failed — ${retryNeeded.length} transaction(s) remain uncategorized`);
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
