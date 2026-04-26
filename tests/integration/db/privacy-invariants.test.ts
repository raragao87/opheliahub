/**
 * Integration tests for the FinancialAccount ownership ↔ householdId
 * CHECK constraint (chk_ownership_household_consistency).
 *
 * Requires a running database (DATABASE_URL). These tests create rows
 * and roll back via deleteMany — they don't depend on the seed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// Test fixtures — created once, deleted after all tests
let testUserId: string;
let testHouseholdId: string;
const TEST_PREFIX = "test-privacy-invariants-";

beforeAll(async () => {
  // Create a test user + household for FK references
  const user = await prisma.user.create({
    data: { id: TEST_PREFIX + "user", email: TEST_PREFIX + "user@test.local" },
  });
  testUserId = user.id;

  const household = await prisma.household.create({
    data: { id: TEST_PREFIX + "household", name: TEST_PREFIX + "household" },
  });
  testHouseholdId = household.id;
});

afterAll(async () => {
  await prisma.financialAccount.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
  await prisma.household.delete({ where: { id: testHouseholdId } });
  await prisma.user.delete({ where: { id: testUserId } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.financialAccount.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
});

async function createAccount(id: string, ownership: "SHARED" | "PERSONAL", householdId: string | null) {
  return prisma.financialAccount.create({
    data: {
      id: TEST_PREFIX + id,
      name: id,
      type: "CHECKING",
      ownership,
      ownerId: testUserId,
      householdId,
      balance: 0,
      currency: "EUR",
      isActive: true,
    },
  });
}

describe("FinancialAccount ownership ↔ householdId CHECK constraint", () => {
  // ── Happy paths ──
  it("allows SHARED account with non-null householdId", async () => {
    const acc = await createAccount("ok-shared", "SHARED", testHouseholdId);
    expect(acc.ownership).toBe("SHARED");
    expect(acc.householdId).toBe(testHouseholdId);
  });

  it("allows PERSONAL account with null householdId", async () => {
    const acc = await createAccount("ok-personal", "PERSONAL", null);
    expect(acc.ownership).toBe("PERSONAL");
    expect(acc.householdId).toBeNull();
  });

  // ── Reject paths — INSERT ──
  it("rejects SHARED account with null householdId", async () => {
    await expect(createAccount("bad-shared", "SHARED", null)).rejects.toThrow(
      /chk_ownership_household_consistency|check constraint/i
    );
  });

  it("rejects PERSONAL account with non-null householdId", async () => {
    await expect(createAccount("bad-personal", "PERSONAL", testHouseholdId)).rejects.toThrow(
      /chk_ownership_household_consistency|check constraint/i
    );
  });

  // ── Reject paths — UPDATE ──
  it("rejects updating a SHARED account's householdId to null", async () => {
    const acc = await createAccount("upd-shared", "SHARED", testHouseholdId);
    await expect(
      prisma.financialAccount.update({
        where: { id: acc.id },
        data: { householdId: null },
      })
    ).rejects.toThrow(/chk_ownership_household_consistency|check constraint/i);
  });

  it("rejects updating a PERSONAL account to set a householdId", async () => {
    const acc = await createAccount("upd-personal", "PERSONAL", null);
    await expect(
      prisma.financialAccount.update({
        where: { id: acc.id },
        data: { householdId: testHouseholdId },
      })
    ).rejects.toThrow(/chk_ownership_household_consistency|check constraint/i);
  });

  it("rejects flipping ownership without also updating householdId", async () => {
    const acc = await createAccount("flip", "PERSONAL", null);
    await expect(
      prisma.financialAccount.update({
        where: { id: acc.id },
        data: { ownership: "SHARED" },
      })
    ).rejects.toThrow(/chk_ownership_household_consistency|check constraint/i);
  });

  it("allows atomic flip of ownership + householdId", async () => {
    const acc = await createAccount("atomic-flip", "PERSONAL", null);
    const updated = await prisma.financialAccount.update({
      where: { id: acc.id },
      data: { ownership: "SHARED", householdId: testHouseholdId },
    });
    expect(updated.ownership).toBe("SHARED");
    expect(updated.householdId).toBe(testHouseholdId);
  });
});
