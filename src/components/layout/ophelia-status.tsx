"use client";

import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact Ophelia status pill for the sidebar.
 *
 * - Shows "X pending" when there are unprocessed transactions.
 * - Shows "All caught up ✨" when nothing is pending.
 * - Clicking runs a manual categorization batch.
 * - Polls every 30 seconds so the count stays fresh.
 * - Renders nothing when Ophelia is disabled.
 */
export function OpheliaStatus() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const pendingQuery = useQuery({
    ...trpc.ophelia.pendingCount.queryOptions(),
    refetchInterval: 30_000,
  });

  const runMutation = useMutation(
    trpc.ophelia.runCategorization.mutationOptions({
      onSuccess: () => {
        // Refresh pending count + transaction list
        queryClient.invalidateQueries();
      },
    })
  );

  const data = pendingQuery.data;
  if (!data?.enabled) return null;

  const pending = data.pending;
  const isRunning = runMutation.isPending;

  return (
    <div className="px-2 pb-2">
      <button
        type="button"
        onClick={() => {
          if (!isRunning) runMutation.mutate({});
        }}
        disabled={isRunning}
        title={
          pending > 0
            ? `${pending} transaction${pending !== 1 ? "s" : ""} waiting for Ophelia — click to categorise now`
            : "Ophelia is up to date — click to run manually"
        }
        className={cn(
          "w-full flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors",
          pending > 0
            ? "text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/40"
            : "text-muted-foreground hover:bg-muted/60"
        )}
      >
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-violet-500" />
        ) : (
          <Sparkles
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              pending > 0 ? "text-violet-500" : "text-muted-foreground"
            )}
          />
        )}
        <span className="truncate">
          {isRunning
            ? "Ophelia running…"
            : pending > 0
            ? `${pending} pending`
            : "All caught up ✨"}
        </span>
        {pending > 0 && !isRunning && (
          <span className="ml-auto shrink-0 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-400 text-[10px] font-semibold px-1.5 py-0.5 tabular-nums">
            {pending}
          </span>
        )}
      </button>
    </div>
  );
}
