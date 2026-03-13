/**
 * Integration tests for enrichTransactions.
 *
 * These tests call the real MiniMax API and are skipped when MINIMAX_API_KEY
 * is not set, so they are safe to run in CI without credentials.
 *
 * To run locally:
 *   pnpm test tests/integration/ophelia/enrich-transactions.test.ts
 * (MINIMAX_API_KEY is loaded automatically from .env.local by tests/setup.ts)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Module mocks (hoisted by vitest before imports) ──────────────────────────

// server-only throws outside Next.js — mock it to a no-op
vi.mock("server-only", () => ({}));

// @/env validates DATABASE_URL etc. which aren't available in test env.
// Provide just what Ophelia needs.
vi.mock("@/env", () => ({
  env: {
    MINIMAX_API_KEY: process.env.MINIMAX_API_KEY,
    OPHELIA_ENABLED: true,
  },
}));

// ── Imports (resolved after mocks are registered) ────────────────────────────

import { enrichTransactions } from "@/lib/ophelia/enrichTransactions";
import * as provider from "@/lib/ophelia/provider";
import type {
  EnrichTransactionsInput,
  CategoryContext,
  TagContext,
  RecentExample,
} from "@/lib/ophelia/types";

// ── Shared test fixtures ─────────────────────────────────────────────────────

const TEST_CATEGORIES: CategoryContext[] = [
  { id: "cat-groceries", name: "Groceries" },
  { id: "cat-transport", name: "Transport" },
  { id: "cat-dining", name: "Dining Out" },
  { id: "cat-subscriptions", name: "Subscriptions" },
  { id: "cat-healthcare", name: "Healthcare" },
  { id: "cat-entertainment", name: "Entertainment" },
  { id: "cat-shopping", name: "Shopping" },
  { id: "cat-utilities", name: "Utilities" },
];

const TEST_TAGS: TagContext[] = [
  { id: "tag-recurring", name: "Recurring" },
  { id: "tag-essential", name: "Essential" },
  { id: "tag-reimbursable", name: "Reimbursable" },
];

const RECENT_EXAMPLES: RecentExample[] = [
  {
    description: "ALBERT HEIJN 1021 AMSTERDAM",
    categoryName: "Groceries",
    displayName: "Albert Heijn",
    tags: ["tag-essential"],
  },
  {
    description: "SPOTIFY PREMIUM",
    categoryName: "Subscriptions",
    displayName: "Spotify Premium",
    tags: ["tag-recurring"],
  },
];

// ── Skip guard ────────────────────────────────────────────────────────────────

const HAS_API_KEY = !!process.env.MINIMAX_API_KEY;

// ── Unit tests (no API key required) ─────────────────────────────────────────

describe("enrichTransactions — unit (no API key required)", () => {
  it("returns an empty array for an empty transaction list without calling the API", async () => {
    const spy = vi.spyOn(provider, "chatCompletion");

    const result = await enrichTransactions({
      transactions: [],
      categories: TEST_CATEGORIES,
      tags: TEST_TAGS,
      recentExamples: RECENT_EXAMPLES,
    });

    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("returns null when the API call fails (chatCompletion returns null)", async () => {
    const spy = vi
      .spyOn(provider, "chatCompletion")
      .mockResolvedValue(null);

    const result = await enrichTransactions({
      transactions: [
        {
          date: "2025-01-15",
          description: "ALBERT HEIJN 1021 AMSTERDAM",
          amount: -2345,
        },
      ],
      categories: TEST_CATEGORIES,
      tags: TEST_TAGS,
      recentExamples: RECENT_EXAMPLES,
    });

    expect(result).toBeNull();

    spy.mockRestore();
  });

  it("returns null when the API returns malformed JSON", async () => {
    const spy = vi
      .spyOn(provider, "chatCompletion")
      .mockResolvedValue("This is not JSON at all.");

    const result = await enrichTransactions({
      transactions: [
        {
          date: "2025-01-15",
          description: "ALBERT HEIJN 1021 AMSTERDAM",
          amount: -2345,
        },
      ],
      categories: TEST_CATEGORIES,
      tags: TEST_TAGS,
      recentExamples: RECENT_EXAMPLES,
    });

    expect(result).toBeNull();

    spy.mockRestore();
  });

  it("returns null when the API returns JSON that fails schema validation", async () => {
    // Missing required fields
    const badPayload = JSON.stringify([{ index: 0 }]);
    const spy = vi
      .spyOn(provider, "chatCompletion")
      .mockResolvedValue(badPayload);

    const result = await enrichTransactions({
      transactions: [
        {
          date: "2025-01-15",
          description: "ALBERT HEIJN 1021 AMSTERDAM",
          amount: -2345,
        },
      ],
      categories: TEST_CATEGORIES,
      tags: TEST_TAGS,
      recentExamples: RECENT_EXAMPLES,
    });

    expect(result).toBeNull();

    spy.mockRestore();
  });
});

// ── Integration tests (require MINIMAX_API_KEY) ───────────────────────────────

describe.skipIf(!HAS_API_KEY)(
  "enrichTransactions — integration (requires MINIMAX_API_KEY)",
  () => {
    // ── Dutch supermarket ─────────────────────────────────────────────────────

    it(
      'categorizes "Albert Heijn" as Groceries with a clean display name',
      async () => {
        const input: EnrichTransactionsInput = {
          transactions: [
            {
              date: "2025-01-15",
              description: "ALBERT HEIJN 1021 AMSTERDAM",
              amount: -2345,
            },
          ],
          categories: TEST_CATEGORIES,
          tags: TEST_TAGS,
          recentExamples: RECENT_EXAMPLES,
        };

        const results = await enrichTransactions(input);

        expect(results).not.toBeNull();
        const r = results![0];

        expect(r.index).toBe(0);
        expect(r.suggestedCategoryId).toBe("cat-groceries");
        expect(r.categoryConfidence).toBeGreaterThan(0.7);
        expect(r.suggestedDisplayName).toMatch(/albert heijn/i);
      },
      60_000
    );

    // ── Dutch public transport ────────────────────────────────────────────────

    it(
      'categorizes "NS" as Transport with a clean display name',
      async () => {
        const input: EnrichTransactionsInput = {
          transactions: [
            {
              date: "2025-01-16",
              description: "NS INT AMSTERDAM CENTRAAL",
              amount: -890,
            },
          ],
          categories: TEST_CATEGORIES,
          tags: TEST_TAGS,
          recentExamples: [],
        };

        const results = await enrichTransactions(input);

        expect(results).not.toBeNull();
        const r = results![0];

        expect(r.index).toBe(0);
        expect(r.suggestedCategoryId).toBe("cat-transport");
        expect(r.categoryConfidence).toBeGreaterThan(0.7);
        expect(r.suggestedDisplayName).toMatch(/ns/i);
      },
      60_000
    );

    // ── Streaming subscription ────────────────────────────────────────────────

    it(
      'categorizes "SPOTIFY PREMIUM" as Subscriptions with clean display name',
      async () => {
        const input: EnrichTransactionsInput = {
          transactions: [
            {
              date: "2025-01-17",
              description: "SPOTIFY PREMIUM",
              amount: -999,
            },
          ],
          categories: TEST_CATEGORIES,
          tags: TEST_TAGS,
          recentExamples: RECENT_EXAMPLES,
        };

        const results = await enrichTransactions(input);

        expect(results).not.toBeNull();
        const r = results![0];

        expect(r.index).toBe(0);
        expect(r.suggestedCategoryId).toBe("cat-subscriptions");
        expect(r.categoryConfidence).toBeGreaterThan(0.7);
        expect(r.suggestedDisplayName).toMatch(/spotify/i);
      },
      60_000
    );

    // ── Restaurant with noisy bank description ────────────────────────────────

    it(
      'categorizes "CCV*RESTAURANT DE HAVEN AMS" as Dining Out with clean display name',
      async () => {
        const input: EnrichTransactionsInput = {
          transactions: [
            {
              date: "2025-01-18",
              description: "CCV*RESTAURANT DE HAVEN AMS",
              amount: -4250,
            },
          ],
          categories: TEST_CATEGORIES,
          tags: TEST_TAGS,
          recentExamples: [],
        };

        const results = await enrichTransactions(input);

        expect(results).not.toBeNull();
        const r = results![0];

        expect(r.index).toBe(0);
        expect(r.suggestedCategoryId).toBe("cat-dining");
        expect(r.categoryConfidence).toBeGreaterThan(0.6);
        // Display name should strip the "CCV*" prefix and city code
        expect(r.suggestedDisplayName).toMatch(/haven/i);
        expect(r.suggestedDisplayName).not.toMatch(/CCV\*/);
      },
      60_000
    );

    // ── Unrecognizable transaction ────────────────────────────────────────────

    it(
      "returns low-confidence / null categoryId for an unrecognizable transaction",
      async () => {
        const input: EnrichTransactionsInput = {
          transactions: [
            {
              date: "2025-01-19",
              description: "OMSCHRIJVING ONBEKEND REF9827364",
              amount: -500,
            },
          ],
          categories: TEST_CATEGORIES,
          tags: TEST_TAGS,
          recentExamples: [],
        };

        const results = await enrichTransactions(input);

        expect(results).not.toBeNull();
        const r = results![0];

        expect(r.index).toBe(0);
        // Either null or low confidence — AI should not be confident
        const isUncertain =
          r.suggestedCategoryId === null || r.categoryConfidence < 0.6;
        expect(isUncertain).toBe(true);
      },
      60_000
    );

    // ── Batch of multiple transactions ────────────────────────────────────────

    it(
      "returns one result per transaction, indices are correct, for a multi-transaction batch",
      async () => {
        const input: EnrichTransactionsInput = {
          transactions: [
            {
              date: "2025-01-15",
              description: "ALBERT HEIJN 1021 AMSTERDAM",
              amount: -2345,
            },
            {
              date: "2025-01-16",
              description: "SPOTIFY PREMIUM",
              amount: -999,
            },
            {
              date: "2025-01-17",
              description: "NS INT AMSTERDAM CENTRAAL",
              amount: -890,
            },
          ],
          categories: TEST_CATEGORIES,
          tags: TEST_TAGS,
          recentExamples: RECENT_EXAMPLES,
        };

        const results = await enrichTransactions(input);

        expect(results).not.toBeNull();
        expect(results).toHaveLength(3);

        // Indices must be 0, 1, 2 in order
        expect(results!.map((r) => r.index)).toEqual([0, 1, 2]);

        // All results must have required fields
        for (const r of results!) {
          expect(typeof r.suggestedDisplayName).toBe("string");
          expect(r.suggestedDisplayName.length).toBeGreaterThan(0);
          expect(r.categoryConfidence).toBeGreaterThanOrEqual(0);
          expect(r.categoryConfidence).toBeLessThanOrEqual(1);
          expect(Array.isArray(r.suggestedTags)).toBe(true);
        }

        // Spot checks
        expect(results![0].suggestedCategoryId).toBe("cat-groceries");
        expect(results![1].suggestedCategoryId).toBe("cat-subscriptions");
        expect(results![2].suggestedCategoryId).toBe("cat-transport");
      },
      60_000
    );
  }
);
