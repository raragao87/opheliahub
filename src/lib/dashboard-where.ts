import { Prisma, TransactionType } from "@prisma/client";
import {
  visibleTransactionsWhere,
  transactionOwnershipFilter,
} from "@/lib/privacy";

export interface DashboardWhereOpts {
  userId: string;
  householdId: string;
  /** When set, scopes to PERSONAL or SHARED accounts. When undefined, includes both. */
  visibility?: "SHARED" | "PERSONAL";
  /** Inclusive date range. */
  dateRange?: { gte: Date; lte: Date };
  /** Defaults to false — initial-balance synthetic transactions are excluded by default. */
  includeInitialBalance?: boolean;
  /** Optional transaction type filter. */
  type?: TransactionType | { in: TransactionType[] };
}

/**
 * Privacy-correct `where` builder for dashboard queries.
 *
 * Composes filters into an `AND` array rather than spreading them into a
 * single object literal — this avoids the key-collision bug where two
 * sibling `account:` keys silently overwrite each other and drop the
 * privacy filter. See git history for the original spread-bug fix.
 *
 * Uses:
 *   - `transactionOwnershipFilter` when `visibility` is set (combined privacy + visibility)
 *   - `visibleTransactionsWhere` when `visibility` is undefined (privacy only)
 */
export function dashboardTransactionsWhere(
  opts: DashboardWhereOpts
): Prisma.TransactionWhereInput {
  const visibilityClause: Prisma.TransactionWhereInput = opts.visibility
    ? transactionOwnershipFilter(opts.userId, opts.householdId, opts.visibility)
    : visibleTransactionsWhere(opts.userId, opts.householdId);

  const clauses: Prisma.TransactionWhereInput[] = [visibilityClause];

  if (opts.dateRange) {
    clauses.push({ date: opts.dateRange });
  }

  // Default behavior: exclude initial-balance synthetic transactions.
  if (!opts.includeInitialBalance) {
    clauses.push({ isInitialBalance: false });
  }

  if (opts.type !== undefined) {
    clauses.push({ type: opts.type });
  }

  return clauses.length === 1 ? clauses[0] : { AND: clauses };
}
