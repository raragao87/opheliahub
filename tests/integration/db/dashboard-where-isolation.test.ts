/**
 * Integration tests for dashboardTransactionsWhere() — verify privacy
 * isolation across users, households, and visibility scopes.
 *
 * The "A2 with visibility=PERSONAL sees only A2-personal" case is the
 * key one: it would FAIL against the unfixed dashboard.ts spread-bug
 * because the privacy filter dropped out and Prisma returned both
 * A1-personal and A2-personal.
 *
 * Requires a running database (DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { dashboardTransactionsWhere } from "@/lib/dashboard-where";

const prisma = new PrismaClient();

const TEST_PREFIX = "test-dashboard-isolation-";

// Fixtures
let householdA: { id: string };
let householdB: { id: string };
let A1: { id: string };
let A2: { id: string };
let B1: { id: string };
let A1Personal: { id: string };
let A2Personal: { id: string };
let B1Personal: { id: string };
let AShared: { id: string };
let BShared: { id: string };
const monthStart = new Date("2030-01-01T00:00:00Z");
const monthEnd = new Date("2030-01-31T23:59:59Z");

beforeAll(async () => {
  // Households
  householdA = await prisma.household.create({ data: { id: TEST_PREFIX + "ha", name: TEST_PREFIX + "ha" } });
  householdB = await prisma.household.create({ data: { id: TEST_PREFIX + "hb", name: TEST_PREFIX + "hb" } });

  // Users
  A1 = await prisma.user.create({ data: { id: TEST_PREFIX + "a1", email: TEST_PREFIX + "a1@t.local" } });
  A2 = await prisma.user.create({ data: { id: TEST_PREFIX + "a2", email: TEST_PREFIX + "a2@t.local" } });
  B1 = await prisma.user.create({ data: { id: TEST_PREFIX + "b1", email: TEST_PREFIX + "b1@t.local" } });

  // Household memberships
  await prisma.householdMember.createMany({
    data: [
      { householdId: householdA.id, userId: A1.id, role: "OWNER", inviteStatus: "ACCEPTED" },
      { householdId: householdA.id, userId: A2.id, role: "PARTNER", inviteStatus: "ACCEPTED" },
      { householdId: householdB.id, userId: B1.id, role: "OWNER", inviteStatus: "ACCEPTED" },
    ],
  });

  // Accounts
  const baseAcct = { type: "CHECKING" as const, balance: 0, currency: "EUR", isActive: true };
  A1Personal = await prisma.financialAccount.create({
    data: { ...baseAcct, id: TEST_PREFIX + "a1p", name: "A1Personal", ownership: "PERSONAL", ownerId: A1.id, householdId: null },
  });
  A2Personal = await prisma.financialAccount.create({
    data: { ...baseAcct, id: TEST_PREFIX + "a2p", name: "A2Personal", ownership: "PERSONAL", ownerId: A2.id, householdId: null },
  });
  B1Personal = await prisma.financialAccount.create({
    data: { ...baseAcct, id: TEST_PREFIX + "b1p", name: "B1Personal", ownership: "PERSONAL", ownerId: B1.id, householdId: null },
  });
  AShared = await prisma.financialAccount.create({
    data: { ...baseAcct, id: TEST_PREFIX + "as", name: "AShared", ownership: "SHARED", ownerId: A1.id, householdId: householdA.id },
  });
  BShared = await prisma.financialAccount.create({
    data: { ...baseAcct, id: TEST_PREFIX + "bs", name: "BShared", ownership: "SHARED", ownerId: B1.id, householdId: householdB.id },
  });

  // Transactions — €100 INCOME on each account, dated mid-month
  const txDate = new Date("2030-01-15T12:00:00Z");
  const baseTx = { type: "INCOME" as const, amount: 10000, currency: "EUR", description: "test income", date: txDate };
  await prisma.transaction.createMany({
    data: [
      { ...baseTx, id: TEST_PREFIX + "tx-a1p", accountId: A1Personal.id, userId: A1.id },
      { ...baseTx, id: TEST_PREFIX + "tx-a2p", accountId: A2Personal.id, userId: A2.id },
      { ...baseTx, id: TEST_PREFIX + "tx-b1p", accountId: B1Personal.id, userId: B1.id },
      { ...baseTx, id: TEST_PREFIX + "tx-as", accountId: AShared.id, userId: A1.id },
      { ...baseTx, id: TEST_PREFIX + "tx-bs", accountId: BShared.id, userId: B1.id },
      // Initial-balance transaction on A1Personal — should be excluded by default
      { ...baseTx, id: TEST_PREFIX + "tx-a1p-init", accountId: A1Personal.id, userId: A1.id, isInitialBalance: true, description: "initial" },
      // EXPENSE on A1Personal — for type-filter test
      { ...baseTx, id: TEST_PREFIX + "tx-a1p-exp", accountId: A1Personal.id, userId: A1.id, type: "EXPENSE", amount: -5000, description: "expense" },
    ],
  });
});

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
  await prisma.financialAccount.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
  await prisma.householdMember.deleteMany({ where: { householdId: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
  await prisma.household.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

describe("dashboardTransactionsWhere isolation", () => {
  it("A1 with no visibility sees A1-personal + A-shared, nothing else", async () => {
    const where = dashboardTransactionsWhere({
      userId: A1.id, householdId: householdA.id,
      dateRange: { gte: monthStart, lte: monthEnd },
    });
    const txs = await prisma.transaction.findMany({ where });
    const accountIds = new Set(txs.map((t) => t.accountId));
    expect(accountIds).toEqual(new Set([A1Personal.id, AShared.id]));
  });

  it("A1 with visibility=PERSONAL sees only A1-personal — not A2's, not B1's", async () => {
    const where = dashboardTransactionsWhere({
      userId: A1.id, householdId: householdA.id, visibility: "PERSONAL",
      dateRange: { gte: monthStart, lte: monthEnd },
    });
    const txs = await prisma.transaction.findMany({ where });
    const accountIds = txs.map((t) => t.accountId);
    expect(accountIds).toContain(A1Personal.id);
    expect(accountIds).not.toContain(A2Personal.id);
    expect(accountIds).not.toContain(B1Personal.id);
    // The CRITICAL spread-bug regression: before the fix, A2-personal would leak in.
  });

  it("A1 with visibility=SHARED sees only A-shared — not B-shared", async () => {
    const where = dashboardTransactionsWhere({
      userId: A1.id, householdId: householdA.id, visibility: "SHARED",
      dateRange: { gte: monthStart, lte: monthEnd },
    });
    const txs = await prisma.transaction.findMany({ where });
    const accountIds = txs.map((t) => t.accountId);
    expect(accountIds).toContain(AShared.id);
    expect(accountIds).not.toContain(BShared.id);
  });

  it("A2 with visibility=PERSONAL sees only A2-personal", async () => {
    // Same household as A1, but different user — A2 must NOT see A1-personal.
    const where = dashboardTransactionsWhere({
      userId: A2.id, householdId: householdA.id, visibility: "PERSONAL",
      dateRange: { gte: monthStart, lte: monthEnd },
    });
    const txs = await prisma.transaction.findMany({ where });
    const accountIds = txs.map((t) => t.accountId);
    expect(accountIds).toEqual([A2Personal.id]);
  });

  it("B1 with no visibility sees only B1-personal + B-shared, never household A's data", async () => {
    const where = dashboardTransactionsWhere({
      userId: B1.id, householdId: householdB.id,
      dateRange: { gte: monthStart, lte: monthEnd },
    });
    const txs = await prisma.transaction.findMany({ where });
    const accountIds = new Set(txs.map((t) => t.accountId));
    expect(accountIds).toEqual(new Set([B1Personal.id, BShared.id]));
    // Cross-household isolation: must not see A1Personal, A2Personal, or AShared.
    for (const id of accountIds) {
      expect([A1Personal.id, A2Personal.id, AShared.id]).not.toContain(id);
    }
  });

  it("excludes initial-balance transactions by default", async () => {
    const where = dashboardTransactionsWhere({
      userId: A1.id, householdId: householdA.id, visibility: "PERSONAL",
      dateRange: { gte: monthStart, lte: monthEnd },
    });
    const txs = await prisma.transaction.findMany({ where });
    expect(txs.some((t) => t.isInitialBalance)).toBe(false);
  });

  it("includes initial-balance transactions when includeInitialBalance: true", async () => {
    const where = dashboardTransactionsWhere({
      userId: A1.id, householdId: householdA.id, visibility: "PERSONAL",
      dateRange: { gte: monthStart, lte: monthEnd },
      includeInitialBalance: true,
    });
    const txs = await prisma.transaction.findMany({ where });
    expect(txs.some((t) => t.isInitialBalance)).toBe(true);
  });

  it("respects type filter when provided", async () => {
    const where = dashboardTransactionsWhere({
      userId: A1.id, householdId: householdA.id, visibility: "PERSONAL",
      dateRange: { gte: monthStart, lte: monthEnd },
      type: "INCOME",
    });
    const txs = await prisma.transaction.findMany({ where });
    expect(txs.every((t) => t.type === "INCOME")).toBe(true);
    // Should exclude the EXPENSE on A1Personal
    expect(txs.some((t) => t.type === "EXPENSE")).toBe(false);
  });
});
