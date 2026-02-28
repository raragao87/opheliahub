/**
 * Broader transfer detection — same amount, ±2 days, different accounts.
 *
 * Run:  npx tsx scripts/find-transfers-broad.ts          (dry-run)
 *       npx tsx scripts/find-transfers-broad.ts --apply  (link them)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const DATE_TOLERANCE_DAYS = 2;

interface TxRow {
  id: string;
  amount: number;
  type: string;
  date: Date;
  description: string;
  accountId: string;
  accountName: string;
}

async function main() {
  // 1. Fetch all unlinked transactions
  const raw = await prisma.transaction.findMany({
    where: {
      linkedTransactionId: null,
      linkedBy: { is: null },
    },
    select: {
      id: true,
      amount: true,
      type: true,
      date: true,
      description: true,
      accountId: true,
      account: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });

  const transactions: TxRow[] = raw.map((t) => ({
    ...t,
    accountName: t.account.name,
  }));

  console.log(`Total unlinked transactions: ${transactions.length}\n`);

  // Separate negatives and positives
  const negatives = transactions.filter((t) => t.amount < 0);
  const positives = transactions.filter((t) => t.amount > 0);

  // Index positives by absAmount for faster lookup
  const positivesByAmount = new Map<number, TxRow[]>();
  for (const p of positives) {
    const key = p.amount; // already positive
    if (!positivesByAmount.has(key)) positivesByAmount.set(key, []);
    positivesByAmount.get(key)!.push(p);
  }

  interface Match {
    outflow: TxRow;
    inflow: TxRow;
    daysDiff: number;
  }

  const matches: Match[] = [];
  const used = new Set<string>();

  for (const neg of negatives) {
    if (used.has(neg.id)) continue;
    const absAmount = Math.abs(neg.amount);
    const candidates = positivesByAmount.get(absAmount) ?? [];

    // Find best match: same amount, different account, closest date within tolerance
    let bestMatch: TxRow | null = null;
    let bestDaysDiff = Infinity;

    for (const pos of candidates) {
      if (used.has(pos.id)) continue;
      if (pos.accountId === neg.accountId) continue;

      const daysDiff = Math.abs(
        (neg.date.getTime() - pos.date.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff <= DATE_TOLERANCE_DAYS && daysDiff < bestDaysDiff) {
        bestMatch = pos;
        bestDaysDiff = daysDiff;
      }
    }

    if (bestMatch) {
      // Skip known false positives (incasso/direct debit matching unrelated transfers)
      const outDesc = neg.description.toLowerCase();
      const inDesc = bestMatch.description.toLowerCase();
      const isFalsePositive =
        outDesc.includes("incasso") ||
        inDesc.includes("incasso");
      if (isFalsePositive) continue;

      matches.push({
        outflow: neg,
        inflow: bestMatch,
        daysDiff: Math.round(bestDaysDiff),
      });
      used.add(neg.id);
      used.add(bestMatch.id);
    }
  }

  if (matches.length === 0) {
    console.log("No additional transfer pairs found.");
    return;
  }

  // Sort by date descending
  matches.sort((a, b) => b.outflow.date.getTime() - a.outflow.date.getTime());

  console.log(`Found ${matches.length} potential transfer pair(s):\n`);
  console.log("─".repeat(100));

  for (const { outflow, inflow, daysDiff } of matches) {
    const date = outflow.date.toISOString().split("T")[0];
    const amount = (Math.abs(outflow.amount) / 100).toFixed(2);
    const dateMark = daysDiff > 0 ? ` (${daysDiff}d apart)` : "";
    console.log(
      `  ${date}  €${amount}  ${outflow.accountName} → ${inflow.accountName}${dateMark}`
    );
    console.log(
      `    OUT: "${outflow.description.substring(0, 100)}" (${outflow.type})`
    );
    console.log(
      `    IN:  "${inflow.description.substring(0, 100)}" (${inflow.type})`
    );
    console.log();
  }

  console.log("─".repeat(100));

  if (!apply) {
    console.log(
      `\nDry run — no changes made. Run with --apply to link these pairs.`
    );
    return;
  }

  console.log(`\nLinking ${matches.length} pair(s)...\n`);

  for (const { outflow, inflow } of matches) {
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: outflow.id },
        data: {
          linkedTransactionId: inflow.id,
          type: "TRANSFER",
          categoryId: null,
        },
      });
      await tx.transaction.update({
        where: { id: inflow.id },
        data: {
          type: "TRANSFER",
          categoryId: null,
        },
      });
    });

    const date = outflow.date.toISOString().split("T")[0];
    const amount = (Math.abs(outflow.amount) / 100).toFixed(2);
    console.log(
      `  ✓ Linked: ${date} €${amount} ${outflow.accountName} → ${inflow.accountName}`
    );
  }

  console.log(`\nDone! Linked ${matches.length} transfer pair(s).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
