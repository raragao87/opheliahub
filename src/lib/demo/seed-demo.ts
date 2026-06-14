/**
 * Repeatable demo seed. Builds a realistic two-partner household ("Alex & Sam")
 * with accounts, ~3 months of categorized transactions, a monthly budget, funds,
 * and assets/debts — used both for the initial demo creation and the daily reset
 * cron. Idempotent: fixed ids, wipes the demo household's data, then rebuilds.
 *
 * The demo user (Alex) is the only account the public "Try the demo" login
 * authenticates, and it lives ONLY in this household, so it can never reach real
 * user data.
 */
import { PrismaClient, type AccountType, type TransactionType } from "@prisma/client";
import { seedDefaultCategories } from "@/lib/seed-categories";
import {
  DEMO_HOUSEHOLD_ID, DEMO_USER_ID, DEMO_PARTNER_ID, DEMO_USER_EMAIL, DEMO_PARTNER_EMAIL,
} from "@/lib/demo/constants";

export { DEMO_HOUSEHOLD_ID, DEMO_USER_ID, DEMO_PARTNER_ID, DEMO_USER_EMAIL, DEMO_PARTNER_EMAIL };

const EUR = "EUR";

/** First day of `monthsAgo` months before now, at noon UTC (timezone-safe). */
function monthStart(monthsAgo: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1, 12, 0, 0));
}
/** A specific day in `monthsAgo` months before now, noon UTC. */
function dayIn(monthsAgo: number, day: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, day, 12, 0, 0));
}

export async function seedDemoHousehold(prisma: PrismaClient): Promise<{ transactions: number }> {
  // ── Users + household + memberships (idempotent) ─────────────────────────
  await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    update: { name: "Alex (Demo)", email: DEMO_USER_EMAIL },
    create: {
      id: DEMO_USER_ID, name: "Alex (Demo)", email: DEMO_USER_EMAIL,
      locale: "nl-NL", language: "en", colorTheme: "luminous",
    },
  });
  await prisma.user.upsert({
    where: { id: DEMO_PARTNER_ID },
    update: { name: "Sam (Demo)", email: DEMO_PARTNER_EMAIL },
    create: {
      id: DEMO_PARTNER_ID, name: "Sam (Demo)", email: DEMO_PARTNER_EMAIL,
      locale: "nl-NL", language: "en", colorTheme: "luminous",
    },
  });
  await prisma.household.upsert({
    where: { id: DEMO_HOUSEHOLD_ID },
    update: { name: "Alex & Sam" },
    create: { id: DEMO_HOUSEHOLD_ID, name: "Alex & Sam" },
  });
  for (const [userId, role] of [[DEMO_USER_ID, "OWNER"], [DEMO_PARTNER_ID, "PARTNER"]] as const) {
    await prisma.householdMember.upsert({
      where: { householdId_userId: { householdId: DEMO_HOUSEHOLD_ID, userId } },
      update: { inviteStatus: "ACCEPTED", role },
      create: { householdId: DEMO_HOUSEHOLD_ID, userId, role, inviteStatus: "ACCEPTED", joinedAt: new Date() },
    });
  }

  // ── Wipe prior demo data (keep users/household/memberships) ──────────────
  const demoAccounts = await prisma.financialAccount.findMany({
    where: { OR: [{ householdId: DEMO_HOUSEHOLD_ID }, { ownerId: { in: [DEMO_USER_ID, DEMO_PARTNER_ID] } }] },
    select: { id: true },
  });
  const acctIds = demoAccounts.map((a) => a.id);
  await prisma.transaction.deleteMany({ where: { accountId: { in: acctIds } } });
  await prisma.importBatch.deleteMany({ where: { accountId: { in: acctIds } } });
  await prisma.financialAccount.deleteMany({ where: { id: { in: acctIds } } });
  await prisma.tracker.deleteMany({ where: { householdId: DEMO_HOUSEHOLD_ID } }); // cascades allocations
  await prisma.category.deleteMany({ where: { householdId: DEMO_HOUSEHOLD_ID } }); // cascades fund allocations/entries
  await prisma.tagGroup.deleteMany({ where: { householdId: DEMO_HOUSEHOLD_ID } });
  await prisma.tag.deleteMany({ where: { userId: { in: [DEMO_USER_ID, DEMO_PARTNER_ID] } } });

  // ── Categories ───────────────────────────────────────────────────────────
  await seedDefaultCategories(prisma, DEMO_HOUSEHOLD_ID);

  // Fund categories (envelope budgeting) — top-level FUND type.
  const funds = [
    { name: "Holiday Fund", icon: "🏖️" },
    { name: "Car Maintenance", icon: "🔧" },
    { name: "Home Improvements", icon: "🏡" },
  ];
  for (const [i, f] of funds.entries()) {
    await prisma.category.create({
      data: { name: f.name, icon: f.icon, type: "FUND", householdId: DEMO_HOUSEHOLD_ID, budgetScope: "SHARED", sortOrder: i },
    });
  }

  // Resolve category ids by (scope, name).
  const cats = await prisma.category.findMany({
    where: { householdId: DEMO_HOUSEHOLD_ID },
    select: { id: true, name: true, budgetScope: true, parentId: true, type: true },
  });
  const catId = (scope: "SHARED" | "PERSONAL", name: string) =>
    cats.find((c) => c.budgetScope === scope && c.name === name && c.parentId !== null)?.id
    ?? cats.find((c) => c.budgetScope === scope && c.name === name)?.id
    ?? null;
  const fundId = (name: string) => cats.find((c) => c.type === "FUND" && c.name === name)!.id;

  // ── Accounts ─────────────────────────────────────────────────────────────
  const mkAccount = async (
    name: string, type: AccountType, ownership: "SHARED" | "PERSONAL", ownerId: string,
    opts: { currency?: string; icon?: string } = {},
  ) => prisma.financialAccount.create({
    data: {
      name, type, ownership, ownerId, currency: opts.currency ?? EUR,
      householdId: ownership === "SHARED" ? DEMO_HOUSEHOLD_ID : null,
      balance: 0, isActive: true,
    },
  });

  const jointChecking = await mkAccount("Joint Checking", "CHECKING", "SHARED", DEMO_USER_ID);
  const jointSavings = await mkAccount("Joint Savings", "SAVINGS", "SHARED", DEMO_USER_ID);
  const creditCard = await mkAccount("Household Credit Card", "CREDIT_CARD", "SHARED", DEMO_USER_ID);
  const brokerage = await mkAccount("Brokerage", "INVESTMENT", "SHARED", DEMO_USER_ID);
  const home = await mkAccount("Our Home", "PROPERTY", "SHARED", DEMO_USER_ID);
  const mortgage = await mkAccount("Mortgage", "MORTGAGE", "SHARED", DEMO_USER_ID);
  const car = await mkAccount("Family Car", "VEHICLE", "SHARED", DEMO_USER_ID);
  const alexSpending = await mkAccount("Alex's Spending", "CHECKING", "PERSONAL", DEMO_USER_ID);
  const samSpending = await mkAccount("Sam's Spending", "CHECKING", "PERSONAL", DEMO_PARTNER_ID);

  // ── Transactions ─────────────────────────────────────────────────────────
  type Txn = {
    accountId: string; userId: string; date: Date; amount: number; type: TransactionType;
    categoryId: string | null; description: string; displayName?: string; isInitialBalance?: boolean;
  };
  const txns: Txn[] = [];
  const add = (t: Txn) => txns.push(t);
  const eur = (n: number) => Math.round(n * 100);

  // Opening balances (initial-balance transactions, 3 months ago).
  const opening: [string, number][] = [
    [jointChecking.id, 2800], [jointSavings.id, 11000], [creditCard.id, 0],
    [brokerage.id, 15500], [home.id, 450000], [mortgage.id, -322000], [car.id, 16000],
    [alexSpending.id, 600], [samSpending.id, 750],
  ];
  for (const [accountId, amount] of opening) {
    add({ accountId, userId: DEMO_USER_ID, date: monthStart(3), amount: eur(amount),
      type: "INCOME", categoryId: null, description: "Opening balance", displayName: "Opening balance", isInitialBalance: true });
  }

  // Recurring monthly activity for the current + previous 2 months.
  for (let m = 2; m >= 0; m--) {
    // Income (into joint checking)
    add({ accountId: jointChecking.id, userId: DEMO_USER_ID, date: dayIn(m, 1), amount: eur(3200), type: "INCOME",
      categoryId: catId("SHARED", "Salary"), description: "ACME Corp Salary", displayName: "Salary — Alex" });
    add({ accountId: jointChecking.id, userId: DEMO_PARTNER_ID, date: dayIn(m, 1), amount: eur(2850), type: "INCOME",
      categoryId: catId("SHARED", "Salary"), description: "Globex BV Salary", displayName: "Salary — Sam" });

    // Fixed expenses (joint checking)
    add({ accountId: jointChecking.id, userId: DEMO_USER_ID, date: dayIn(m, 2), amount: eur(-1450), type: "EXPENSE",
      categoryId: catId("SHARED", "Rent / Mortgage"), description: "Mortgage payment ING", displayName: "Mortgage" });
    add({ accountId: jointChecking.id, userId: DEMO_USER_ID, date: dayIn(m, 3), amount: eur(-165), type: "EXPENSE",
      categoryId: catId("SHARED", "Utilities"), description: "Greenchoice energy", displayName: "Energy" });
    add({ accountId: jointChecking.id, userId: DEMO_USER_ID, date: dayIn(m, 3), amount: eur(-45), type: "EXPENSE",
      categoryId: catId("SHARED", "Utilities"), description: "Vodafone internet", displayName: "Internet" });
    add({ accountId: jointChecking.id, userId: DEMO_USER_ID, date: dayIn(m, 4), amount: eur(-138), type: "EXPENSE",
      categoryId: catId("SHARED", "Insurance"), description: "Zilveren Kruis health insurance", displayName: "Health insurance" });
    add({ accountId: creditCard.id, userId: DEMO_USER_ID, date: dayIn(m, 6), amount: eur(-12.99), type: "EXPENSE",
      categoryId: catId("SHARED", "Subscriptions"), description: "Netflix", displayName: "Netflix" });
    add({ accountId: creditCard.id, userId: DEMO_PARTNER_ID, date: dayIn(m, 6), amount: eur(-10.99), type: "EXPENSE",
      categoryId: catId("SHARED", "Subscriptions"), description: "Spotify Premium", displayName: "Spotify" });

    // Groceries (a few per month)
    for (const [d, amt, shop] of [[5, -54.2, "Albert Heijn"], [12, -38.75, "Jumbo"], [19, -61.4, "Albert Heijn"], [26, -29.95, "Lidl"]] as const) {
      add({ accountId: jointChecking.id, userId: m % 2 ? DEMO_USER_ID : DEMO_PARTNER_ID, date: dayIn(m, d), amount: eur(amt), type: "EXPENSE",
        categoryId: catId("SHARED", "Groceries"), description: `${shop} ${d}`, displayName: shop });
    }
    // Dining
    add({ accountId: creditCard.id, userId: DEMO_USER_ID, date: dayIn(m, 9), amount: eur(-48.5), type: "EXPENSE",
      categoryId: catId("SHARED", "Dining Out"), description: "Restaurant De Kas", displayName: "Restaurant" });
    add({ accountId: creditCard.id, userId: DEMO_PARTNER_ID, date: dayIn(m, 21), amount: eur(-23.8), type: "EXPENSE",
      categoryId: catId("SHARED", "Dining Out"), description: "Thuisbezorgd", displayName: "Takeaway" });
    // Transport
    add({ accountId: jointChecking.id, userId: DEMO_USER_ID, date: dayIn(m, 8), amount: eur(-72.3), type: "EXPENSE",
      categoryId: catId("SHARED", "Transport"), description: "Shell fuel", displayName: "Fuel" });
    add({ accountId: creditCard.id, userId: DEMO_PARTNER_ID, date: dayIn(m, 15), amount: eur(-18.4), type: "EXPENSE",
      categoryId: catId("SHARED", "Transport"), description: "NS train", displayName: "NS train" });
    // Entertainment / shopping
    add({ accountId: creditCard.id, userId: DEMO_USER_ID, date: dayIn(m, 17), amount: eur(-35), type: "EXPENSE",
      categoryId: catId("SHARED", "Entertainment"), description: "Pathé cinema", displayName: "Cinema" });
    add({ accountId: creditCard.id, userId: DEMO_PARTNER_ID, date: dayIn(m, 23), amount: eur(-89.95), type: "EXPENSE",
      categoryId: catId("SHARED", "Shopping"), description: "Bol.com order", displayName: "Bol.com" });

    // Fund spending (paid from joint savings, type FUND)
    if (m === 1) add({ accountId: jointSavings.id, userId: DEMO_USER_ID, date: dayIn(m, 14), amount: eur(-420), type: "FUND",
      categoryId: fundId("Car Maintenance"), description: "APK + tyres garage", displayName: "Car service" });
    if (m === 0) add({ accountId: jointSavings.id, userId: DEMO_PARTNER_ID, date: dayIn(m, 10), amount: eur(-260), type: "FUND",
      categoryId: fundId("Home Improvements"), description: "IKEA shelving", displayName: "IKEA" });

    // Monthly transfer to savings (shown as expense from checking + income to savings — simple, unlinked)
    add({ accountId: jointChecking.id, userId: DEMO_USER_ID, date: dayIn(m, 2), amount: eur(-600), type: "EXPENSE",
      categoryId: catId("SHARED", "Savings"), description: "Auto-save to Joint Savings", displayName: "To savings" });
    add({ accountId: jointSavings.id, userId: DEMO_USER_ID, date: dayIn(m, 2), amount: eur(600), type: "INCOME",
      categoryId: catId("SHARED", "Savings"), description: "Auto-save from Joint Checking", displayName: "From checking" });

    // Personal spending (Alex + Sam each on their own account)
    add({ accountId: alexSpending.id, userId: DEMO_USER_ID, date: dayIn(m, 11), amount: eur(-34.9), type: "EXPENSE",
      categoryId: catId("PERSONAL", "Hobbies"), description: "Camera accessories", displayName: "Photography" });
    add({ accountId: alexSpending.id, userId: DEMO_USER_ID, date: dayIn(m, 20), amount: eur(-19.99), type: "EXPENSE",
      categoryId: catId("PERSONAL", "Subscriptions"), description: "Adobe Lightroom", displayName: "Adobe" });
    add({ accountId: samSpending.id, userId: DEMO_PARTNER_ID, date: dayIn(m, 13), amount: eur(-65), type: "EXPENSE",
      categoryId: catId("PERSONAL", "Clothing"), description: "Zara", displayName: "Zara" });
    add({ accountId: samSpending.id, userId: DEMO_PARTNER_ID, date: dayIn(m, 24), amount: eur(-29), type: "EXPENSE",
      categoryId: catId("PERSONAL", "Health & Fitness"), description: "Basic-Fit gym", displayName: "Gym" });

    // Brokerage: monthly contribution + a dividend
    add({ accountId: brokerage.id, userId: DEMO_USER_ID, date: dayIn(m, 5), amount: eur(500), type: "INVESTMENT",
      categoryId: catId("SHARED", "Buy"), description: "Monthly ETF purchase (VWRL)", displayName: "ETF buy" });
    if (m === 1) add({ accountId: brokerage.id, userId: DEMO_USER_ID, date: dayIn(m, 18), amount: eur(42.3), type: "INVESTMENT",
      categoryId: catId("SHARED", "Dividend"), description: "VWRL dividend", displayName: "Dividend" });
  }

  // Persist transactions and reconcile each account's balance to its txn sum.
  await prisma.transaction.createMany({
    data: txns.map((t) => ({
      accountId: t.accountId, userId: t.userId, date: t.date, amount: t.amount, type: t.type,
      currency: EUR, categoryId: t.categoryId, effectiveCategoryId: t.categoryId,
      description: t.description, displayName: t.displayName ?? t.description,
      originalDescription: t.description, isInitialBalance: t.isInitialBalance ?? false,
    })),
  });
  const balByAccount = new Map<string, number>();
  for (const t of txns) balByAccount.set(t.accountId, (balByAccount.get(t.accountId) ?? 0) + t.amount);
  for (const [accountId, balance] of balByAccount) {
    await prisma.financialAccount.update({ where: { id: accountId }, data: { balance } });
  }

  // A completed import so the demo reads as a fully set-up household (clears the
  // getting-started checklist).
  await prisma.importBatch.create({
    data: {
      fileName: "joint-checking-statement.csv", format: "CSV", status: "COMPLETED",
      totalRows: 24, importedRows: 24, userId: DEMO_USER_ID, accountId: jointChecking.id,
    },
  });

  // ── Budget (current-month tracker) ───────────────────────────────────────
  const now = new Date();
  const tracker = await prisma.tracker.create({
    data: {
      householdId: DEMO_HOUSEHOLD_ID, userId: DEMO_USER_ID,
      month: now.getUTCMonth() + 1, year: now.getUTCFullYear(), budgetScope: "SHARED",
    },
  });
  const alloc: [string | null, number][] = [
    [catId("SHARED", "Salary"), 6050],
    [catId("SHARED", "Rent / Mortgage"), 1450], [catId("SHARED", "Utilities"), 220],
    [catId("SHARED", "Insurance"), 140], [catId("SHARED", "Subscriptions"), 30],
    [catId("SHARED", "Groceries"), 450], [catId("SHARED", "Dining Out"), 150],
    [catId("SHARED", "Transport"), 160], [catId("SHARED", "Entertainment"), 80],
    [catId("SHARED", "Shopping"), 120], [catId("SHARED", "Savings"), 600],
  ];
  await prisma.trackerAllocation.createMany({
    data: alloc.filter(([id]) => id).map(([categoryId, amt]) => ({ trackerId: tracker.id, categoryId: categoryId!, amount: eur(amt) })),
  });
  await prisma.fundTrackerAllocation.createMany({
    data: [["Holiday Fund", 300], ["Car Maintenance", 100], ["Home Improvements", 150]].map(
      ([name, amt]) => ({ trackerId: tracker.id, categoryId: fundId(name as string), amount: eur(amt as number) }),
    ),
  });

  return { transactions: txns.length };
}
