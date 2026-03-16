"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { MoneyDisplay } from "@/components/shared/money-display";
import { cn } from "@/lib/utils";
import { X, Loader2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { fromCents } from "@/lib/money";

interface TagAnalysisPanelProps {
  target: { type: "group" | "tag"; id: string; name: string };
  visibility: "SHARED" | "PERSONAL";
  onClose: () => void;
  onSelectTag?: (tagId: string, tagName: string) => void;
}

const PERIOD_PRESETS = [
  { label: "All time", getRange: () => ({ from: undefined, to: undefined }) },
  { label: "This year", getRange: () => ({ from: new Date(new Date().getFullYear(), 0, 1), to: undefined }) },
  { label: "Last 12 mo", getRange: () => { const d = new Date(); d.setMonth(d.getMonth() - 12); return { from: d, to: undefined }; } },
  { label: "Last 6 mo", getRange: () => { const d = new Date(); d.setMonth(d.getMonth() - 6); return { from: d, to: undefined }; } },
];

function formatShortDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function formatMonth(d: Date | string) {
  return new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function TagAnalysisPanel({ target, visibility, onClose, onSelectTag }: TagAnalysisPanelProps) {
  const trpc = useTRPC();
  const [periodIdx, setPeriodIdx] = useState(0);
  const period = PERIOD_PRESETS[periodIdx].getRange();

  const groupQuery = useQuery({
    ...trpc.tag.getGroupAnalysis.queryOptions({
      tagGroupId: target.id,
      visibility,
      dateFrom: period.from,
      dateTo: period.to,
    }),
    enabled: target.type === "group",
  });

  const tagQuery = useQuery({
    ...trpc.tag.tagAnalysis.queryOptions({
      tagIds: [target.id],
      visibility,
      dateFrom: period.from,
      dateTo: period.to,
    }),
    enabled: target.type === "tag",
  });

  const isLoading = target.type === "group" ? groupQuery.isLoading : tagQuery.isLoading;

  // Normalize data from either query type
  const data = target.type === "group" ? groupQuery.data : (() => {
    const t = tagQuery.data?.tags[0];
    if (!t) return null;
    return {
      group: { id: "", name: target.name, icon: null },
      totalAmount: t.totalAmount,
      transactionCount: t.transactionCount,
      dateRange: t.dateRange,
      byTag: [] as Array<{ tagId: string; tagName: string; tagColor: string | null; totalAmount: number; count: number; percentage: number }>,
      byCategory: t.byCategory,
      byMonth: t.byMonth.map((m) => ({ ...m, byTag: [] as Array<{ tagId: string; tagName: string; amount: number }> })),
      byAccount: t.byAccount,
      recentTransactions: t.recentTransactions.map((tx) => ({ ...tx, tagNames: [target.name] })),
    };
  })();

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex-1 min-w-0">
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Analysis</span>
          <span className="text-sm font-semibold ml-2">{target.name}</span>
        </div>
        <div className="flex gap-1 shrink-0">
          {PERIOD_PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => setPeriodIdx(i)}
              className={cn(
                "text-[10px] px-2 py-1 rounded font-medium transition-colors",
                periodIdx === i ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <div className="p-4 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Total</p>
              <MoneyDisplay amount={data.totalAmount} className="text-lg font-bold" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Transactions</p>
              <p className="text-lg font-bold">{data.transactionCount}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Period</p>
              <p className="text-sm font-medium text-muted-foreground">
                {data.dateRange ? `${formatMonth(data.dateRange.first)} – ${formatMonth(data.dateRange.last)}` : "—"}
              </p>
            </div>
          </div>

          {data.transactionCount === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No transactions found for this selection.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Per-tag breakdown (group only) */}
              {data.byTag.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">By tag</p>
                  <div className="space-y-1.5">
                    {data.byTag.map((tag) => (
                      <button
                        key={tag.tagId}
                        onClick={() => onSelectTag?.(tag.tagId, tag.tagName)}
                        className="flex items-center gap-2 w-full hover:bg-muted/30 rounded px-1 py-0.5 -mx-1 transition-colors text-left"
                      >
                        {tag.tagColor && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.tagColor }} />}
                        <span className="text-sm flex-1 min-w-0 truncate">{tag.tagName}</span>
                        <MoneyDisplay amount={tag.totalAmount} className="text-sm font-medium shrink-0 tabular-nums whitespace-nowrap" />
                        <span className="text-[10px] text-muted-foreground w-10 text-right tabular-nums shrink-0">{Math.round(tag.percentage)}%</span>
                        <div className="w-16 h-1.5 rounded-full bg-muted shrink-0 hidden sm:block">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(tag.percentage, 100)}%` }} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Category breakdown */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">By category</p>
                <div className="space-y-1.5">
                  {data.byCategory.map((cat) => {
                    const pct = data.totalAmount !== 0 ? Math.abs(cat.amount / data.totalAmount) * 100 : 0;
                    return (
                      <div key={cat.categoryId ?? "__none__"} className="flex items-center gap-2">
                        <span className="text-sm w-5 shrink-0">{cat.categoryIcon ?? "📄"}</span>
                        <span className="text-sm flex-1 min-w-0 truncate">{cat.categoryName ?? "Uncategorized"}</span>
                        <MoneyDisplay amount={cat.amount} className="text-sm font-medium shrink-0 tabular-nums whitespace-nowrap" />
                        <span className="text-[10px] text-muted-foreground w-10 text-right tabular-nums shrink-0">{Math.round(pct)}%</span>
                        <div className="w-16 h-1.5 rounded-full bg-muted shrink-0 hidden sm:block">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Monthly trend chart */}
              {data.byMonth.length > 1 && (
                <div className="lg:col-span-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Monthly trend</p>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.byMonth.map((m) => ({ ...m, absAmount: Math.abs(fromCents(m.amount)) }))}>
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                          formatter={(value) => [`€ ${Number(value ?? 0).toFixed(2)}`, "Amount"]}
                        />
                        <Bar dataKey="absAmount" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Account breakdown */}
              {data.byAccount.length > 1 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">By account</p>
                  <div className="space-y-1.5">
                    {data.byAccount.map((acc) => {
                      const pct = data.totalAmount !== 0 ? Math.abs(acc.amount / data.totalAmount) * 100 : 0;
                      return (
                        <div key={acc.accountId} className="flex items-center gap-2">
                          <span className="text-sm flex-1 min-w-0 truncate">{acc.accountName}</span>
                          <MoneyDisplay amount={acc.amount} className="text-sm font-medium shrink-0 tabular-nums whitespace-nowrap" />
                          <span className="text-[10px] text-muted-foreground w-10 text-right tabular-nums shrink-0">{Math.round(pct)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent transactions */}
              <div className={data.byAccount.length > 1 ? "" : "lg:col-span-2"}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Recent transactions</p>
                <div className="space-y-0.5">
                  {data.recentTransactions.slice(0, 10).map((txn) => (
                    <div key={txn.id} className="flex items-center gap-2 py-1 hover:bg-muted/20 rounded px-1 -mx-1 transition-colors">
                      <span className="text-xs text-muted-foreground w-14 shrink-0 tabular-nums">{formatShortDate(txn.date)}</span>
                      <span className="text-sm flex-1 min-w-0 truncate">{txn.displayName || txn.description}</span>
                      <span className="text-xs text-muted-foreground hidden sm:block shrink-0">{txn.accountName}</span>
                      <MoneyDisplay amount={txn.amount} className="text-sm font-medium shrink-0 tabular-nums whitespace-nowrap" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
