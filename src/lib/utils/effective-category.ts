/**
 * Returns the "effective" category for a transaction: the user's explicit
 * choice if set, otherwise Ophelia's suggestion, otherwise null.
 *
 * The user's choice (categoryId) always wins over Ophelia's suggestion.
 */

export interface EffectiveCategoryResult {
  categoryId: string;
  source: "user" | "ophelia";
  confidence?: number; // only present when source === "ophelia"
}

export interface TransactionWithOpheliaFields {
  categoryId: string | null;
  opheliaCategoryId?: string | null;
  opheliaConfidence?: number | null;
}

/**
 * Given a transaction with optional Ophelia fields, returns the effective
 * category source to use for display.
 *
 * Returns null if neither a user category nor an Ophelia suggestion is set.
 */
export function getEffectiveCategory(
  transaction: TransactionWithOpheliaFields
): EffectiveCategoryResult | null {
  if (transaction.categoryId) {
    return { categoryId: transaction.categoryId, source: "user" };
  }
  if (transaction.opheliaCategoryId) {
    return {
      categoryId: transaction.opheliaCategoryId,
      source: "ophelia",
      confidence: transaction.opheliaConfidence ?? undefined,
    };
  }
  return null;
}
