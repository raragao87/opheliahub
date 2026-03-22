"use client";

import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MoneyDisplay } from "@/components/shared/money-display";
import { AlertTriangle, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserPreferences } from "@/lib/user-preferences-context";
import { t, type Language } from "@/lib/translations";
import { toast } from "sonner";

interface DuplicateReviewPanelProps {
  accountId?: string;
}

export function DuplicateReviewPanel({ accountId }: DuplicateReviewPanelProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { preferences } = useUserPreferences();
  const lang = preferences.language as Language;

  const alertsQuery = useQuery({
    ...trpc.duplicates.listAlerts.queryOptions({
      accountId,
      status: "pending",
    }),
  });

  const dismissMutation = useMutation(
    trpc.duplicates.dismiss.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.duplicates.pendingByAccount.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.duplicates.listAlerts.queryKey() });
        toast.success(t(lang, "duplicates.review.dismissed"));
      },
    })
  );

  const resolveMutation = useMutation(
    trpc.duplicates.resolve.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.duplicates.pendingByAccount.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.duplicates.listAlerts.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.account.list.queryKey() });
        toast.success(t(lang, "duplicates.review.resolved"));
      },
    })
  );

  const dismissAllMutation = useMutation(
    trpc.duplicates.dismissAll.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: trpc.duplicates.pendingByAccount.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.duplicates.listAlerts.queryKey() });
        toast.success(`${data.dismissed} ${t(lang, "duplicates.review.dismissed").toLowerCase()}`);
      },
    })
  );

  const alerts = alertsQuery.data;
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          {alerts.length} {t(lang, "duplicates.review.title")}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dismissAllMutation.mutate({ accountId })}
          disabled={dismissAllMutation.isPending}
          className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
        >
          {t(lang, "duplicates.review.dismissAll")}
        </Button>
      </div>

      <div className="space-y-2">
        {alerts.map((alert) => {
          const txA = alert.transactionA;
          const txB = alert.transactionB;
          if (!txA || !txB) return null;

          const isResolving = resolveMutation.isPending;
          const isDismissing = dismissMutation.isPending;
          const busy = isResolving || isDismissing;

          // Pre-select: keep the one with more data (has category, longer description)
          const scoreA = (txA.category ? 1 : 0) + (txA.displayName?.length ?? 0);
          const scoreB = (txB.category ? 1 : 0) + (txB.displayName?.length ?? 0);
          const suggestDeleteA = scoreA < scoreB;

          const confidencePct = Math.round(alert.confidence * 100);

          return (
            <div
              key={alert.id}
              className="rounded-md border border-amber-200 bg-white p-3 dark:border-amber-800 dark:bg-amber-950/50 space-y-2"
            >
              {/* Header */}
              <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-300">
                <span>
                  {txA.date ? new Date(txA.date).toLocaleDateString(preferences.locale) : "—"}
                  {" · "}
                  <MoneyDisplay
                    amount={txA.amount}
                    currency={txA.currency}
                    className="text-xs inline"
                    colorize={false}
                  />
                </span>
                <span className="text-amber-500 dark:text-amber-500">
                  {t(lang, "duplicates.review.confidence")}: {confidencePct}%
                </span>
              </div>

              {/* Transaction pair */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <TransactionCard
                  label={txA.displayName ?? txA.description}
                  category={txA.category?.name}
                  categoryIcon={txA.category?.icon}
                  isSuggestedDelete={suggestDeleteA}
                  onDelete={() => resolveMutation.mutate({ alertId: alert.id, deleteTransactionId: txA.id })}
                  onKeep={() => resolveMutation.mutate({ alertId: alert.id, deleteTransactionId: txB.id })}
                  busy={busy}
                  lang={lang}
                />
                <TransactionCard
                  label={txB.displayName ?? txB.description}
                  category={txB.category?.name}
                  categoryIcon={txB.category?.icon}
                  isSuggestedDelete={!suggestDeleteA}
                  onDelete={() => resolveMutation.mutate({ alertId: alert.id, deleteTransactionId: txB.id })}
                  onKeep={() => resolveMutation.mutate({ alertId: alert.id, deleteTransactionId: txA.id })}
                  busy={busy}
                  lang={lang}
                />
              </div>

              {/* Reasoning + dismiss */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground italic">
                  {alert.reasoning}
                </span>
                <button
                  type="button"
                  onClick={() => dismissMutation.mutate({ alertId: alert.id })}
                  disabled={busy}
                  className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:underline shrink-0 ml-2"
                >
                  {t(lang, "duplicates.review.dismiss")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TransactionCard({
  label,
  category,
  categoryIcon,
  isSuggestedDelete,
  onDelete,
  onKeep,
  busy,
  lang,
}: {
  label: string;
  category?: string | null;
  categoryIcon?: string | null;
  isSuggestedDelete: boolean;
  onDelete: () => void;
  onKeep: () => void;
  busy: boolean;
  lang: Language;
}) {
  return (
    <div
      className={cn(
        "rounded border px-3 py-2 flex items-center justify-between gap-2",
        isSuggestedDelete
          ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30"
          : "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs truncate font-medium">{label}</p>
        {category && (
          <p className="text-[10px] text-muted-foreground truncate">
            {categoryIcon && <span className="mr-1">{categoryIcon}</span>}
            {category}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onKeep}
          disabled={busy}
          className="h-6 px-1.5 text-green-700 hover:text-green-800 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/30"
          title={t(lang, "duplicates.review.keep")}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={busy}
          className="h-6 px-1.5 text-red-600 hover:text-red-700 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30"
          title={t(lang, "duplicates.review.delete")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
