"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOwnership } from "@/lib/ownership-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoneyDisplay } from "@/components/shared/money-display";
import { VisibilityBadge } from "@/components/shared/visibility-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ACCOUNT_TYPE_META } from "@/lib/account-types";
import { NetWorthTrendChart } from "@/components/charts/net-worth-trend";
import { useUserPreferences } from "@/lib/user-preferences-context";
import { t } from "@/lib/translations";
import { formatMoney } from "@/lib/money";
import { toast } from "sonner";
import {
  Plus,
  Wallet,
  ChevronRight,
  Layers,
  Building2,
  RefreshCw,
  History,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

type GroupBy = "type" | "institution";

interface AccountItem {
  id: string;
  name: string;
  type: string;
  ownership: string;
  balance: number;
  currency: string;
  institution: string | null;
  isActive: boolean;
  owner: { id: string; name: string | null; image: string | null };
}

function groupAccounts(accounts: AccountItem[], groupBy: GroupBy) {
  const groups = new Map<string, { label: string; accounts: AccountItem[]; order: number }>();

  for (const account of accounts) {
    let key: string;
    let label: string;
    let order: number;

    switch (groupBy) {
      case "type": {
        const meta = ACCOUNT_TYPE_META[account.type];
        key = account.type;
        label = meta?.label ?? account.type;
        order = meta?.groupOrder ?? 99;
        break;
      }
      case "institution": {
        const inst = account.institution || "Other";
        key = inst;
        label = inst;
        order = inst === "Other" ? 99 : 0;
        break;
      }
    }

    if (!groups.has(key)) {
      groups.set(key, { label, accounts: [], order });
    }
    groups.get(key)!.accounts.push(account);
  }

  return [...groups.values()].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.label.localeCompare(b.label);
  });
}

export default function AccountsPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { isVisible, visibilityParam } = useOwnership();
  const { preferences } = useUserPreferences();
  const lang = preferences.language;
  const locale = preferences.locale;

  const accountsQuery = useQuery(trpc.account.list.queryOptions());
  const trendQuery = useQuery(
    trpc.netWorth.getTrend.queryOptions({
      visibility: visibilityParam ?? "SHARED",
      months: 12,
    })
  );

  const [groupBy, setGroupBy] = useState<GroupBy>("type");

  const snapshotMutation = useMutation(
    trpc.netWorth.captureSnapshot.mutationOptions({
      onSuccess: () => {
        toast.success(t(lang, "netWorth.snapshotSaved"));
        queryClient.invalidateQueries(trpc.netWorth.getTrend.queryOptions({
          visibility: visibilityParam ?? "SHARED",
          months: 12,
        }));
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const backfillMutation = useMutation(
    trpc.netWorth.backfillSnapshots.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Created ${data.created} snapshots`);
        queryClient.invalidateQueries(trpc.netWorth.getTrend.queryOptions({
          visibility: visibilityParam ?? "SHARED",
          months: 12,
        }));
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const vis = visibilityParam ?? "SHARED";

  if (accountsQuery.isLoading) {
    return <div className="text-muted-foreground">Loading accounts...</div>;
  }

  const allAccounts = accountsQuery.data ?? [];
  const accounts = allAccounts.filter((a) => a.isActive && isVisible(a.ownership as "SHARED" | "PERSONAL"));
  const inactiveAccounts = allAccounts.filter((a) => !a.isActive && isVisible(a.ownership as "SHARED" | "PERSONAL"));

  const assetAccounts = accounts.filter((a) => !ACCOUNT_TYPE_META[a.type]?.isLiability);
  const liabilityAccounts = accounts.filter((a) => ACCOUNT_TYPE_META[a.type]?.isLiability);
  const totalAssets = assetAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + Math.abs(a.balance), 0);
  const netWorth = totalAssets - totalLiabilities;

  const grouped = groupAccounts(accounts, groupBy);
  const hasAnyContent = accounts.length > 0 || inactiveAccounts.length > 0;

  const trend = trendQuery.data;
  const hasTrend = (trend?.dataPoints.length ?? 0) > 0;

  // Determine the primary currency from accounts (most common)
  const currencyCount = new Map<string, number>();
  for (const a of accounts) {
    currencyCount.set(a.currency, (currencyCount.get(a.currency) ?? 0) + 1);
  }
  const primaryCurrency =
    [...currencyCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "EUR";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Accounts</h1>
        <Button onClick={() => router.push("/accounts/new")}>
          <Plus className="h-4 w-4 mr-1" />
          Add Account
        </Button>
      </div>

      {!hasAnyContent ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add your first bank account, credit card, or savings account to start tracking."
          actionLabel="Add Account"
          onAction={() => router.push("/accounts/new")}
        />
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t(lang, "netWorth.assets")}</CardTitle>
              </CardHeader>
              <CardContent>
                <MoneyDisplay
                  amount={totalAssets}
                  className="text-2xl font-bold text-green-600 dark:text-green-400"
                  colorize={false}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {assetAccounts.length} account{assetAccounts.length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t(lang, "netWorth.liabilities")}</CardTitle>
              </CardHeader>
              <CardContent>
                <MoneyDisplay
                  amount={-totalLiabilities}
                  className="text-2xl font-bold text-red-600 dark:text-red-400"
                  colorize={false}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {liabilityAccounts.length} account{liabilityAccounts.length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t(lang, "netWorth.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <MoneyDisplay
                  amount={netWorth}
                  className={`text-2xl font-bold ${
                    netWorth >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                  colorize={false}
                />
              </CardContent>
            </Card>
          </div>

          {/* Net Worth Trend Chart */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>{t(lang, "netWorth.trend")}</CardTitle>
                  {hasTrend && trend && (
                    <CardDescription className="mt-1">
                      <span className={trend.changeAmount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                        {trend.changeAmount >= 0 ? "+" : ""}
                        {formatMoney(trend.changeAmount, primaryCurrency, locale)}
                        {" "}({trend.changePercent >= 0 ? "+" : ""}{trend.changePercent.toFixed(1)}%)
                      </span>
                      {" "}{t(lang, "netWorth.change")} {trend.dataPoints.length} {t(lang, "netWorth.months")}
                    </CardDescription>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {!hasTrend && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={backfillMutation.isPending}
                      onClick={() => backfillMutation.mutate({ visibility: vis, monthsBack: 12 })}
                    >
                      <History className="h-3.5 w-3.5 mr-1" />
                      {backfillMutation.isPending ? t(lang, "netWorth.backfilling") : t(lang, "netWorth.backfill")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={snapshotMutation.isPending}
                    onClick={() => snapshotMutation.mutate({ visibility: vis })}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${snapshotMutation.isPending ? "animate-spin" : ""}`} />
                    {hasTrend ? t(lang, "netWorth.refreshSnapshot") : t(lang, "netWorth.takeSnapshot")}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {hasTrend && trend ? (
                <NetWorthTrendChart dataPoints={trend.dataPoints} currency={primaryCurrency} />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">{t(lang, "netWorth.noData")}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Grouping selector */}
          {accounts.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Group by</span>
              <div className="flex gap-1 p-1 bg-muted rounded-lg">
                {([
                  { key: "type" as const, label: "Type", icon: Layers },
                  { key: "institution" as const, label: "Institution", icon: Building2 },
                ]).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setGroupBy(key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      groupBy === key
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grouped account sections */}
          {grouped.map((group) => {
            const groupBalance = group.accounts.reduce((s, a) => s + a.balance, 0);

            return (
              <Card key={group.label}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{group.label}</CardTitle>
                    <MoneyDisplay
                      amount={groupBalance}
                      className="text-sm font-semibold"
                      colorize={false}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="divide-y">
                    {group.accounts.map((account) => {
                      const meta = ACCOUNT_TYPE_META[account.type];
                      const Icon = meta?.icon ?? Wallet;

                      return (
                        <div
                          key={account.id}
                          className="flex items-center gap-3 py-3 cursor-pointer hover:bg-muted/50 -mx-6 px-6 transition-colors"
                          onClick={() => router.push(`/accounts/${account.id}`)}
                        >
                          <div className="flex items-center justify-center h-9 w-9 rounded-full bg-muted shrink-0">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{account.name}</span>
                              {account.ownership === "SHARED" && (
                                <VisibilityBadge visibility="SHARED" className="text-[10px]" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {account.institution && <span>{account.institution}</span>}
                              {account.institution && <span>·</span>}
                              <span>{meta?.label ?? account.type}</span>
                            </div>
                          </div>
                          <MoneyDisplay
                            amount={account.balance}
                            currency={account.currency}
                            className="text-sm font-semibold shrink-0"
                          />
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Inactive accounts */}
          {inactiveAccounts.length > 0 && (
            <details className="group">
              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground list-none flex items-center gap-1">
                <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                {inactiveAccounts.length} archived account{inactiveAccounts.length !== 1 ? "s" : ""}
              </summary>
              <Card className="mt-3 opacity-60">
                <CardContent className="pt-4">
                  <div className="divide-y">
                    {inactiveAccounts.map((account) => {
                      const meta = ACCOUNT_TYPE_META[account.type];
                      const Icon = meta?.icon ?? Wallet;
                      return (
                        <div
                          key={account.id}
                          className="flex items-center gap-3 py-3 cursor-pointer hover:bg-muted/50 -mx-6 px-6 transition-colors"
                          onClick={() => router.push(`/accounts/${account.id}`)}
                        >
                          <div className="flex items-center justify-center h-9 w-9 rounded-full bg-muted shrink-0">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium truncate">{account.name}</span>
                            <div className="text-xs text-muted-foreground">
                              {meta?.label ?? account.type}
                              {account.institution && ` · ${account.institution}`}
                            </div>
                          </div>
                          <MoneyDisplay
                            amount={account.balance}
                            currency={account.currency}
                            className="text-sm font-semibold shrink-0"
                          />
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </details>
          )}
        </>
      )}
    </div>
  );
}
