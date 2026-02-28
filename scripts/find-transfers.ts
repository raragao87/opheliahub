/**
 * Find and link potential transfer pairs across accounts.
 *
 * A "match" is two transactions with:
 *   - Same absolute amount (opposite signs)
 *   - Same date
 *   - Different accounts
 *   - Neither already linked
 *
 * Run:  npx tsx scripts/find-transfers.ts          (dry-run — just report)
 *       npx tsx scripts/find-transfers.ts --apply  (actually link them)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

interface TxRow {
  id: string;
  amount: number;
  type: string;
  date: Date;
  description: string;
  accountId: string;
  accountName: string;
  linkedTransactionId: string | null;
}

async function main() {
  // 1. Fetch all transactions that are NOT already linked
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
      linkedTransactionId: true,
      account: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });

  const transactions: TxRow[] = raw.map((t) => ({
    ...t,
    accountName: t.account.name,
  }));

  console.log(`Total unlinked transactions: ${transactions.length}\n`);

  // 2. Group by date+absAmount for quick matching
  const key = (t: TxRow) =>
    `${t.date.toISOString().split("T")[0]}|${Math.abs(t.amount)}`;

  const groups = new Map<string, TxRow[]>();
  for (const t of transactions) {
    const k = key(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }

  // 3. Find pairs: one negative, one positive, different accounts
  interface Match {
    outflow: TxRow;
    inflow: TxRow;
  }
  const matches: Match[] = [];
  const used = new Set<string>();

  for (const [, group] of groups) {
    const negatives = group.filter((t) => t.amount < 0);
    const positives = group.filter((t) => t.amount > 0);

    for (const neg of negatives) {
      if (used.has(neg.id)) continue;
      for (const pos of positives) {
        if (used.has(pos.id)) continue;
        if (neg.accountId === pos.accountId) continue;
        if (Math.abs(neg.amount) !== pos.amount) continue;

        matches.push({ outflow: neg, inflow: pos });
        used.add(neg.id);
        used.add(pos.id);
        break; // one match per outflow
      }
    }
  }

  if (matches.length === 0) {
    console.log("No potential transfer pairs found.");
    return;
  }

  console.log(`Found ${matches.length} potential transfer pair(s):\n`);
  console.log("─".repeat(90));

  for (const { outflow, inflow } of matches) {
    const date = outflow.date.toISOString().split("T")[0];
    const amount = (Math.abs(outflow.amount) / 100).toFixed(2);
    console.log(
      `  ${date}  €${amount}  ${outflow.accountName} → ${inflow.accountName}`
    );
    console.log(
      `    OUT: "${outflow.description}" (${outflow.type}, id: ${outflow.id})`
    );
    console.log(
      `    IN:  "${inflow.description}" (${inflow.type}, id: ${inflow.id})`
    );
    console.log();
  }

  console.log("─".repeat(90));

  if (!apply) {
    console.log(
      `\nDry run — no changes made. Run with --apply to link these pairs.`
    );
    return;
  }

  // 4. Apply: link pairs and update types + balances
  console.log(`\nLinking ${matches.length} pair(s)...\n`);

  for (const { outflow, inflow } of matches) {
    await prisma.$transaction(async (tx) => {
      // Set outflow.linkedTransactionId → inflow.id
      await tx.transaction.update({
        where: { id: outflow.id },
        data: {
          linkedTransactionId: inflow.id,
          type: "TRANSFER",
          categoryId: null,
        },
      });

      // Mark inflow as TRANSFER too
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
