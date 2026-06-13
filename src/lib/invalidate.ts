import type { QueryClient } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@/trpc/router";

export type TRPCProxy = TRPCOptionsProxy<AppRouter>;

/**
 * Invalidate financial data after a transaction-affecting mutation.
 *
 * Deliberately does NOT touch slow-changing reference data (categories,
 * tags, household, session, investment assets) — a bare
 * `queryClient.invalidateQueries()` refetched ~20 queries per edit and made
 * every categorization feel slow. Reference-data mutations should invalidate
 * their own router via `trpc.<router>.pathFilter()` in addition to this.
 */
export function invalidateFinancialData(queryClient: QueryClient, trpc: TRPCProxy) {
  void queryClient.invalidateQueries(trpc.transaction.pathFilter());
  void queryClient.invalidateQueries(trpc.dashboard.pathFilter());
  void queryClient.invalidateQueries(trpc.tracker.pathFilter());
  void queryClient.invalidateQueries(trpc.fund.pathFilter());
  void queryClient.invalidateQueries(trpc.netWorth.pathFilter());
  void queryClient.invalidateQueries(trpc.account.pathFilter());
  void queryClient.invalidateQueries(trpc.portfolio.pathFilter());
  void queryClient.invalidateQueries(trpc.ophelia.pathFilter()); // pending/duplicate counts
}
