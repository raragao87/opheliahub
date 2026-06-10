"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyDisplay } from "@/components/shared/money-display";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Wallet, Receipt, TrendingUp, Globe } from "lucide-react";
import { t, type Language } from "@/lib/translations";

export interface PortfolioSummary {
  totalValueEurCents: number;
  totalCostEurCents: number;
  unrealizedGainEurCents: number;
  localGainEurCents: number;
  fxGainEurCents: number;
  returnPct: number | null;
  holdingsCount: number;
  missingRateCurrencies: string[];
  stalePriceCount: number;
}

export function PortfolioSummaryCards({
  summary,
  isLoading,
  lang,
}: {
  summary: PortfolioSummary | undefined;
  isLoading: boolean;
  lang: Language;
}) {
  const gainColor = (cents: number) =>
    cents > 0
      ? "text-green-600 dark:text-green-400"
      : cents < 0
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Total value */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t(lang, "portfolio.totalValue")}</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading || !summary ? (
            <Skeleton className="h-8 w-28" />
          ) : (
            <MoneyDisplay amount={summary.totalValueEurCents} colorize={false} className="text-2xl font-bold" />
          )}
        </CardContent>
      </Card>

      {/* Total cost */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t(lang, "portfolio.totalCost")}</CardTitle>
          <Receipt className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading || !summary ? (
            <Skeleton className="h-8 w-28" />
          ) : (
            <MoneyDisplay amount={summary.totalCostEurCents} colorize={false} className="text-2xl font-bold" />
          )}
        </CardContent>
      </Card>

      {/* Unrealized gain */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t(lang, "portfolio.unrealizedGain")}</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading || !summary ? (
            <Skeleton className="h-8 w-28" />
          ) : (
            <>
              <MoneyDisplay
                amount={summary.unrealizedGainEurCents}
                showSign
                className={cn("text-2xl font-bold", gainColor(summary.unrealizedGainEurCents))}
                colorize={false}
              />
              {summary.returnPct != null && (
                <p className={cn("text-xs font-medium mt-1", gainColor(summary.unrealizedGainEurCents))}>
                  {summary.returnPct > 0 ? "+" : ""}
                  {(summary.returnPct * 100).toFixed(1)}% {t(lang, "portfolio.return")}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Gain breakdown: local vs FX */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t(lang, "portfolio.gainBreakdown")}</CardTitle>
          <Globe className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading || !summary ? (
            <Skeleton className="h-8 w-28" />
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t(lang, "portfolio.localGain")}</span>
                <MoneyDisplay
                  amount={summary.localGainEurCents}
                  showSign
                  className={cn("text-sm font-medium", gainColor(summary.localGainEurCents))}
                  colorize={false}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t(lang, "portfolio.fxGain")}</span>
                <MoneyDisplay
                  amount={summary.fxGainEurCents}
                  showSign
                  className={cn("text-sm font-medium", gainColor(summary.fxGainEurCents))}
                  colorize={false}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
