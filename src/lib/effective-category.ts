/**
 * Compute the effective category for a transaction.
 * User-confirmed category wins, then Ophelia suggestion, then null.
 */
export function computeEffectiveCategoryId(
  categoryId: string | null | undefined,
  opheliaCategoryId: string | null | undefined,
): string | null {
  return categoryId ?? opheliaCategoryId ?? null;
}
