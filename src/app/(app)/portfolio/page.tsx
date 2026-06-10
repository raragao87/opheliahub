"use client";

import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOwnership } from "@/lib/ownership-context";
import { useUserPreferences } from "@/lib/user-preferences-context";
import { t } from "@/lib/translations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PortfolioSummaryCards } from "./portfolio-summary-cards";
import { HoldingsTable } from "./holdings-table";
import { AllocationChart } from "./allocation-chart";
import { ChartPie, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function PortfolioPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { budgetScopeParam } = useOwnership();
  const { preferences } = useUserPreferences();
  const lang = preferences.language;
  const locale = preferences.locale;

  const scope = { budgetScope: budgetScopeParam ?? ("SHARED" as const) };

  const summaryQuery = useQuery(trpc.portfolio.getSummary.queryOptions(scope));
  const holdingsQuery = useQuery(trpc.portfolio.getHoldings.queryOptions(scope));
  const allocationQuery = useQuery(trpc.portfolio.getAllocation.queryOptions(scope));

  const setPriceMutation = useMutation(
    trpc.portfolio.setAssetPrice.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.portfolio.getSummary.queryOptions(scope).queryKey });
        queryClient.invalidateQueries({ queryKey: trpc.portfolio.getHoldings.queryOptions(scope).queryKey });
        queryClient.invalidateQueries({ queryKey: trpc.portfolio.getAllocation.queryOptions(scope).queryKey });
        toast.success(t(lang, "portfolio.priceSaved"));
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const holdings = holdingsQuery.data ?? [];
  const summary = summaryQuery.data;
  const isLoading = holdingsQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t(lang, "portfolio.title")}</h1>
      </div>

      {!isLoading && holdings.length === 0 ? (
        <EmptyState
          icon={ChartPie}
          title={t(lang, "portfolio.emptyTitle")}
          description={t(lang, "portfolio.emptyDescription")}
          actionLabel={t(lang, "portfolio.emptyAction")}
          onAction={() => router.push("/transactions")}
        />
      ) : (
        <>
          <PortfolioSummaryCards summary={summary} isLoading={summaryQuery.isLoading} lang={lang} />

          {summary && summary.missingRateCurrencies.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {t(lang, "portfolio.missingRate").replace(
                "{currency}",
                summary.missingRateCurrencies.join(", ")
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t(lang, "portfolio.holdings")}</CardTitle>
              </CardHeader>
              <CardContent>
                <HoldingsTable
                  holdings={holdings}
                  onSetPrice={(assetId, price) =>
                    setPriceMutation.mutate({ assetId, date: new Date(), price })
                  }
                  lang={lang}
                  locale={locale}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t(lang, "portfolio.allocation")}</CardTitle>
              </CardHeader>
              <CardContent>
                <AllocationChart
                  allocation={allocationQuery.data ?? []}
                  totalValueEurCents={summary?.totalValueEurCents ?? 0}
                  locale={locale}
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
