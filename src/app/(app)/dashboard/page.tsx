"use client";

import { useState, useEffect } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { getCurrentYearMonth, getPreviousMonth } from "@/lib/date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyDisplay } from "@/components/shared/money-display";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/date";
import { useOwnership } from "@/lib/ownership-context";
import { useUserPreferences } from "@/lib/user-preferences-context";
import { TrendingUp, TrendingDown, Percent } from "lucide-react";
import { GettingStartedChecklist } from "@/components/shared/getting-started-checklist";
import { NetWorthTrendChart, PeriodSelector, PERIOD_OPTIONS, type PeriodKey } from "@/components/charts/net-worth-trend";
import { DeltaIndicator } from "./delta-indicator";
import { FundProgressSection } from "./fund-progress";
import { MacroOverviewChart, ExpenseBreakdownChart, FundEvolutionChart } from "./dashboard-charts";
import { t } from "@/lib/translations";
import { useOpheliaChat } from "@/lib/ophelia/chat-context";
import { fromCents } from "@/lib/money";

export default function DashboardPage() {
  const trpc = useTRPC();
  const { visibilityParam } = useOwnership();
  const { preferences } = useUserPreferences();
  const lang = preferences.language;
  const { year, month } = getCurrentYearMonth();
  const prev = getPreviousMonth(year, month);

  const [period, setPeriod] = useState<PeriodKey>("6M");

  const reviewQuery = useQuery(
    trpc.dashboard.monthlyReview.queryOptions({
      year,
      month,
      compareYear: prev.year,
      compareMonth: prev.month,
      visibility: visibilityParam ?? "SHARED",
    })
  );

  const fundSummaryQuery = useQuery(
    trpc.dashboard.fundSummary.queryOptions({
      year,
      month,
      visibility: visibilityParam ?? "SHARED",
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
      months: PERIOD_OPTIONS.find((o) => o.key === period)?.months ?? 6,
    })
  );

  const netWorthSummaryQuery = useQuery(
    trpc.netWorth.getSummary.queryOptions({
      visibility: visibilityParam,
    })
  );

  const monthName = new Date(year, month - 1).toLocaleString("default", { month: "long" });

  if (reviewQuery.error && !reviewQuery.data) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Set up your household and add accounts to see your financial overview.
        </p>
      </div>
    );
  }

  const review = reviewQuery.data;
  const deltas = review?.deltas;
  const funds = fundSummaryQuery.data;
  const accounts = accountsQuery.data ?? [];
  const recentTxns = recentTxnsQuery.data ?? [];
  const trend = trendQuery.data;

  // Ophelia page context
  const { setPageSummary } = useOpheliaChat();
  useEffect(() => {
    if (!review) return;
    const parts: string[] = [
      `Income: €${fromCents(review.current.totalIncome).toFixed(2)}`,
      `Expenses: €${fromCents(Math.abs(review.current.totalExpenses)).toFixed(2)}`,
      `Savings rate: ${review.current.savingsRate.toFixed(0)}%`,
    ];
    if (review.current.byCategory.length > 0) {
      const top = review.current.byCategory[0];
      parts.push(`Top expense category: ${top.categoryName ?? "Uncategorized"}`);
    }
    setPageSummary(parts.join(", "));
  }, [review, setPageSummary]);

  return (
    <div className="space-y-6">
      <GettingStartedChecklist />
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <span className="text-muted-foreground">
          {monthName} {year}
        </span>
      </div>

      {/* Summary Cards with MoM Deltas */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {/* Income */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t(lang, "dashboard.income")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {reviewQuery.isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <MoneyDisplay amount={review?.current.totalIncome ?? 0} className="text-2xl font-bold" />
                {deltas && (
                  <div className="mt-1">
                    <DeltaIndicator
                      value={deltas.incomeChange}
                      percentage={deltas.incomeChangePercent}
                      label={t(lang, "dashboard.vsLastMonth")}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Expenses */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t(lang, "dashboard.expenses")}</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            {reviewQuery.isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <MoneyDisplay
                  amount={Math.abs(review?.current.totalExpenses ?? 0)}
                  className="text-2xl font-bold"
                  colorize={false}
                />
                {deltas && (
                  <div className="mt-1">
                    <DeltaIndicator
                      value={deltas.expensesChange}
                      percentage={deltas.expensesChangePercent}
                      invertColor
                      label={t(lang, "dashboard.vsLastMonth")}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Savings Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t(lang, "dashboard.savingsRate")}</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {reviewQuery.isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <span className="text-2xl font-bold tabular-nums">
                  {(review?.current.savingsRate ?? 0).toFixed(0)}%
                </span>
                {deltas && (
                  <div className="mt-1">
                    <DeltaIndicator
                      value={deltas.savingsRateChange}
                      percentage={deltas.savingsRateChange}
                      isPercentagePoints
                      label={t(lang, "dashboard.vsLastMonth")}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fund Progress */}
      {fundSummaryQuery.isLoading ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : funds ? (
        <FundProgressSection funds={funds.funds} lang={lang} />
      ) : null}

      {/* 12-Month Charts */}
      {reviewQuery.isLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-lg" />
          ))}
        </div>
      ) : review ? (
        <div className="space-y-6">
          <MacroOverviewChart data={review.trends.months} lang={lang} />
          <ExpenseBreakdownChart data={review.expensesByGroup} lang={lang} />
          <FundEvolutionChart data={review.fundHistory} lang={lang} />
        </div>
      ) : null}

      {/* Net Worth Card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
              {trend && trend.dataPoints.length > 0 && (
                <p className={`text-xs font-medium mt-0.5 ${trend.changeAmount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {trend.changeAmount >= 0 ? "+" : ""}{trend.changePercent.toFixed(1)}%
                  {" "}({PERIOD_OPTIONS.find((o) => o.key === period)?.label})
                </p>
              )}
            </div>
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <MoneyDisplay amount={netWorthSummaryQuery.data?.netWorth ?? 0} className="text-2xl font-bold mb-1" />
          {trendQuery.isLoading ? (
            <div className="mt-2 h-[180px] bg-muted animate-pulse rounded" />
          ) : trendQuery.isError ? (
            <p className="text-xs text-destructive mt-2">Could not load trend ({trendQuery.error?.message})</p>
          ) : (trend?.dataPoints.length ?? 0) > 1 && trend ? (
            <NetWorthTrendChart
              dataPoints={trend.dataPoints}
              currency={(() => {
                const currencyCount = new Map<string, number>();
                for (const a of accounts) {
                  currencyCount.set(a.currency, (currencyCount.get(a.currency) ?? 0) + 1);
                }
                return [...currencyCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "EUR";
              })()}
              compact
            />
          ) : (
            <p className="text-xs text-muted-foreground mt-2">
              {(trend?.dataPoints.length ?? 0) === 1
                ? "One snapshot saved — more data will appear over time."
                : "No snapshot data yet. Go to Accounts to build history."}
            </p>
          )}
        </CardContent>
      </Card>

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
