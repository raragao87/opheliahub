import type { PrismaClient } from "@prisma/client";
import { resolveDuplicates } from "./resolveDuplicates";

/**
 * Background check for duplicates after an import is committed.
 * Compares newly imported transactions against existing ones in the same date range.
 * Creates DuplicateAlert records for any matches found.
 */
export async function checkPostImportDuplicates(
  prisma: PrismaClient,
  userId: string,
  householdId: string,
  accountId: string,
  batchId: string
) {
  // Fetch all transactions from the newly imported batch
  const imported = await prisma.transaction.findMany({
    where: { importBatchId: batchId },
    select: { id: true, date: true, amount: true, description: true, displayName: true, opheliaDisplayName: true },
  });

  if (imported.length === 0) return;

  // Get date range
  const dates = imported.map((t) => t.date.getTime());
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  // Extend by 1 day for fuzzy matching
  minDate.setDate(minDate.getDate() - 1);
  maxDate.setDate(maxDate.getDate() + 1);

  // Fetch existing transactions in the same date range (excluding the batch itself)
  const existing = await prisma.transaction.findMany({
    where: {
      accountId,
      date: { gte: minDate, lte: maxDate },
      importBatchId: { not: batchId },
      isInitialBalance: false,
      OR: [
        { visibility: "SHARED" },
        { userId },
      ],
    },
    select: { id: true, date: true, amount: true, description: true, displayName: true, opheliaDisplayName: true },
  });

  if (existing.length === 0) return;

  // Find same-amount-same-date pairs across the two sets
  const candidates: {
    importedTx: (typeof imported)[number];
    existingTx: (typeof existing)[number];
  }[] = [];

  for (const imp of imported) {
    for (const ex of existing) {
      if (imp.amount !== ex.amount) continue;
      const dayDiff = Math.abs(imp.date.getTime() - ex.date.getTime());
      if (dayDiff > 86400000) continue; // more than 1 day apart

      // Skip if any name variant is obviously the same (these were caught by fast check).
      // Compare all available names (description, displayName, opheliaDisplayName).
      const namesA = [imp.description, imp.displayName, imp.opheliaDisplayName].filter(Boolean).map(n => n!.toLowerCase().slice(0, 20));
      const namesB = [ex.description, ex.displayName, ex.opheliaDisplayName].filter(Boolean).map(n => n!.toLowerCase().slice(0, 20));
      const obviousDuplicate = namesA.some(a => namesB.some(b => a.includes(b) || b.includes(a)));
      if (obviousDuplicate) continue;

      candidates.push({ importedTx: imp, existingTx: ex });
    }
  }

  if (candidates.length === 0) return;

  // Send ambiguous pairs to AI for resolution (limit to 20 pairs)
  const pairs = candidates.slice(0, 20).map(({ importedTx: imp, existingTx: ex }, index) => ({
    index,
    newTransaction: {
      date: imp.date.toISOString().slice(0, 10),
      description: imp.description,
      amount: imp.amount,
      ...(imp.opheliaDisplayName ? { opheliaDisplayName: imp.opheliaDisplayName } : {}),
    },
    existingTransaction: {
      date: ex.date.toISOString().slice(0, 10),
      description: ex.description,
      amount: ex.amount,
      displayName: ex.displayName ?? ex.description,
      ...(ex.opheliaDisplayName ? { opheliaDisplayName: ex.opheliaDisplayName } : {}),
    },
  }));

  const resolutions = await resolveDuplicates(pairs);
  if (!resolutions) return;

  // Create DuplicateAlert records for confirmed duplicates
  const alerts = resolutions
    .filter((r) => r.isDuplicate && r.confidence > 0.6)
    .map((r) => {
      const candidate = candidates[r.pairIndex];
      return {
        userId,
        accountId,
        importBatchId: batchId,
        transactionIdA: candidate.importedTx.id,
        transactionIdB: candidate.existingTx.id,
        confidence: r.confidence,
        reasoning: r.reasoning,
        status: "PENDING" as const,
      };
    });

  if (alerts.length > 0) {
    await prisma.duplicateAlert.createMany({ data: alerts });
  }
}
