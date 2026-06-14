import { PrismaClient } from "@prisma/client";
import { seedDemoHousehold, DEMO_HOUSEHOLD_ID, DEMO_USER_ID } from "../src/lib/demo/seed-demo";

async function main() {
  const url = process.argv.includes("--prod") ? process.env.PROD_DATABASE_URL : process.env.DATABASE_URL;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const r = await seedDemoHousehold(prisma);
  console.log("Seeded demo. Transactions:", r.transactions);
  // quick summary
  const accts = await prisma.financialAccount.findMany({ where: { OR: [{ householdId: DEMO_HOUSEHOLD_ID }, { ownerId: { in: [DEMO_USER_ID, "demo_user_sam"] } }] }, select: { name: true, type: true, ownership: true, balance: true, currency: true } });
  for (const a of accts) console.log(`  ${a.ownership.padEnd(8)} ${a.type.padEnd(12)} ${(a.balance/100).toFixed(2).padStart(11)} ${a.currency}  ${a.name}`);
  const txCount = await prisma.transaction.count({ where: { account: { OR: [{ householdId: DEMO_HOUSEHOLD_ID }, { ownerId: { in: [DEMO_USER_ID, "demo_user_sam"] } }] } } });
  console.log("Total transactions:", txCount);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
