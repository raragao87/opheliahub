"use client";

import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCurrentYearMonth } from "@/lib/date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoneyDisplay } from "@/components/shared/money-display";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/date";
import { useOwnership } from "@/lib/ownership-context";
import { TrendingUp, TrendingDown, Wallet, ArrowLeftRight, RefreshCw } from "lucide-react";
import { GettingStartedChecklist } from "@/components/shared/getting-started-checklist";
import { NetWorthSparkline } from "@/components/charts/net-worth-trend";
import { toast } from "sonner";

export default function DashboardPage() {
  const trpc = useTRPC();
  const { visibilityParam } = useOwnership();
  const { year, month } = getCurrentYearMonth();

  const summaryQuery = useQuery(
    trpc.dashboard.monthlySummary.queryOptions({
      year,
      month,
      visibility: visibilityParam,
    })
  );

  const accountsQuery = useQuery(
    trpc.dashboard.accountBalances.queryOptions({
      visibility: visibilityParam,
    })
  );

  const recentTxnsQuery = useQuery(
    trpc.dashboard.recentTransactions.queryOptions({
      limit: 10,
      visibility: visibilityParam,
    })
  );

  const trendQuery = useQuery(
    trpc.netWorth.getTrend.queryOptions({
      visibility: visibilityParam ?? "SHARED",
      months: 6,
    })
  );

  const netWorthSummaryQuery = useQuery(
    trpc.netWorth.getSummary.queryOptions({
      visibility: visibilityParam,
    })
  );

  const queryClient = useQueryClient();
  const snapshotMutation = useMutation(
    trpc.netWorth.captureSnapshot.mutationOptions({
      onSuccess: () => {
        toast.success("Snapshot saved");
        queryClient.invalidateQueries({ queryKey: ["netWorth"] });
        void trendQuery.refetch();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const monthName = new Date(year, month - 1).toLocaleString("default", { month: "long" });

  if (summaryQuery.isLoading || accountsQuery.isLoading) {
    return <div className="text-muted-foreground">Loading dashboard...</div>;
  }

  if (summaryQuery.error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Set up your household and add accounts to see your financial overview.
        </p>
      </div>
    );
  }

  const summary = summaryQuery.data!;
  const accounts = accountsQuery.data ?? [];
  const recentTxns = recentTxnsQuery.data ?? [];
  const trend = trendQuery.data;

  return (
    <div className="space-y-6">
      <GettingStartedChecklist />
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <span className="text-muted-foreground">
          {monthName} {year}
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <MoneyDisplay amount={summary.totalIncome} className="text-2xl font-bold" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <MoneyDisplay
              amount={-summary.totalExpenses}
              className="text-2xl font-bold"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Flow</CardTitle>
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <MoneyDisplay amount={summary.netFlow} className="text-2xl font-bold" showSign />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accounts</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accounts.length}</div>
          </CardContent>
        </Card>

      </div>

      {/* Net Worth Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
          {trend && trend.dataPoints.length > 0 && (
            <span className={`text-xs font-medium ${trend.changeAmount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {trend.changeAmount >= 0 ? "+" : ""}{trend.changePercent.toFixed(1)}% (6 mo)
            </span>
          )}
        </CardHeader>
        <CardContent className="pb-3">
          <div className="flex items-end justify-between gap-4">
            <MoneyDisplay amount={netWorthSummaryQuery.data?.netWorth ?? 0} className="text-2xl font-bold" />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground"
              disabled={snapshotMutation.isPending}
              onClick={() => snapshotMutation.mutate({ visibility: visibilityParam ?? "SHARED" })}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${snapshotMutation.isPending ? "animate-spin" : ""}`} />
              {snapshotMutation.isPending ? "Saving…" : "Save snapshot"}
            </Button>
          </div>
          {trendQuery.isLoading ? (
            <div className="mt-2 h-[52px] bg-muted animate-pulse rounded" />
          ) : trendQuery.isError ? (
            <p className="text-xs text-destructive mt-2">Could not load trend ({trendQuery.error?.message})</p>
          ) : (trend?.dataPoints.length ?? 0) > 1 && trend ? (
            <div className="mt-2">
              <NetWorthSparkline dataPoints={trend.dataPoints} height={52} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-2">
              {(trend?.dataPoints.length ?? 0) === 1
                ? "One snapshot saved — save another next month to see the trend."
                : "Click \"Save snapshot\" to start tracking the trend over time."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Two-column layout: Category Breakdown + Accounts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Spending by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Spending by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expenses this month.</p>
            ) : (
              <div className="space-y-3">
                {summary.byCategory.slice(0, 8).map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{item.category?.icon ?? "?"}</span>
                      <span className="text-sm font-medium">
                        {item.category?.name ?? "Uncategorized"}
                      </span>
                    </div>
                    <MoneyDisplay amount={-item.amount} className="text-sm" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Balances */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account Balances</CardTitle>
          </CardHeader>
          <CardContent>
            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No accounts yet.</p>
            ) : (
              <div className="space-y-3">
                {accounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{account.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {account.type.replace("_", " ")}
                      </Badge>
                    </div>
                    <MoneyDisplay
                      amount={account.balance}
                      currency={account.currency}
                      className="text-sm font-medium"
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTxns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="space-y-2">
              {recentTxns.map((txn) => (
                <div
                  key={txn.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg">{txn.category?.icon ?? "?"}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{txn.displayName || txn.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(txn.date)} &middot; {txn.account.name}
                      </p>
                    </div>
                  </div>
                  <MoneyDisplay amount={txn.amount} className="text-sm font-medium shrink-0" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
