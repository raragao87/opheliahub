"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { MoneyDisplay } from "@/components/shared/money-display";
import { cn } from "@/lib/utils";
import { X, Loader2, TrendingDown, Hash, Calendar } from "lucide-react";
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

const CHART_TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  backgroundColor: "hsl(var(--card))",
  color: "hsl(var(--card-foreground))",
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
};

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
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border/50">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">{target.name}</h3>
        </div>
        <div className="flex gap-0.5 shrink-0 bg-muted/50 rounded-md p-0.5">
          {PERIOD_PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => setPeriodIdx(i)}
              className={cn(
                "text-[10px] px-2.5 py-1 rounded font-medium transition-all",
                periodIdx === i
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <div className="p-5 space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-muted/30 border border-border/50 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total</p>
              </div>
              <MoneyDisplay amount={data.totalAmount} className="text-lg font-bold" />
            </div>
            <div className="rounded-lg bg-muted/30 border border-border/50 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Hash className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Transactions</p>
              </div>
              <p className="text-lg font-bold">{data.transactionCount}</p>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border/50 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Period</p>
              </div>
              <p className="text-sm font-medium">
                {data.dateRange ? `${formatMonth(data.dateRange.first)} – ${formatMonth(data.dateRange.last)}` : "—"}
              </p>
            </div>
          </div>

          {data.transactionCount === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No transactions found for this selection.</p>
          ) : (
            <>
              {/* Monthly trend chart */}
              {data.byMonth.length > 1 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3">Monthly trend</p>
                  <div className="h-48 rounded-lg bg-muted/20 border border-border/30 p-3 pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.byMonth.map((m) => ({ ...m, absAmount: Math.abs(fromCents(m.amount)) }))} barCategoryGap="20%">
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                          width={45}
                          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                        />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                          formatter={(value) => [`€ ${Number(value ?? 0).toFixed(2)}`, "Amount"]}
                        />
                        <Bar dataKey="absAmount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={48} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Per-tag breakdown (group only) */}
                {data.byTag.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">By tag</p>
                    <div className="space-y-1">
                      {data.byTag.map((tag) => (
                        <button
                          key={tag.tagId}
                          onClick={() => onSelectTag?.(tag.tagId, tag.tagName)}
                          className="flex items-center gap-2.5 w-full hover:bg-muted/40 rounded-md px-2 py-1.5 -mx-2 transition-colors text-left"
                        >
                          <span className="w-1.5 h-6 rounded-full shrink-0" style={{ backgroundColor: tag.tagColor ?? "hsl(var(--primary))" }} />
                          <span className="text-sm flex-1 min-w-0 truncate">{tag.tagName}</span>
                          <MoneyDisplay amount={tag.totalAmount} className="text-sm font-medium shrink-0 tabular-nums" />
                          <span className="text-[10px] text-muted-foreground w-10 text-right tabular-nums shrink-0">{Math.round(tag.percentage)}%</span>
                          <div className="w-20 h-1.5 rounded-full bg-muted shrink-0 hidden sm:block overflow-hidden">
                            <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(tag.percentage, 100)}%` }} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Category breakdown */}
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">By category</p>
                  <div className="space-y-1">
                    {data.byCategory.map((cat) => {
                      const pct = data.totalAmount !== 0 ? Math.abs(cat.amount / data.totalAmount) * 100 : 0;
                      return (
                        <div key={cat.categoryId ?? "__none__"} className="flex items-center gap-2.5 px-2 py-1.5 -mx-2 rounded-md">
                          <span className="text-sm w-5 shrink-0 text-center">{cat.categoryIcon ?? "📄"}</span>
                          <span className="text-sm flex-1 min-w-0 truncate">{cat.categoryName ?? "Uncategorized"}</span>
                          <MoneyDisplay amount={cat.amount} className="text-sm font-medium shrink-0 tabular-nums" />
                          <span className="text-[10px] text-muted-foreground w-10 text-right tabular-nums shrink-0">{Math.round(pct)}%</span>
                          <div className="w-20 h-1.5 rounded-full bg-muted shrink-0 hidden sm:block overflow-hidden">
                            <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Account breakdown */}
                {data.byAccount.length > 1 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">By account</p>
                    <div className="space-y-1">
                      {data.byAccount.map((acc) => {
                        const pct = data.totalAmount !== 0 ? Math.abs(acc.amount / data.totalAmount) * 100 : 0;
                        return (
                          <div key={acc.accountId} className="flex items-center gap-2.5 px-2 py-1.5 -mx-2 rounded-md">
                            <span className="text-sm flex-1 min-w-0 truncate">{acc.accountName}</span>
                            <MoneyDisplay amount={acc.amount} className="text-sm font-medium shrink-0 tabular-nums" />
                            <span className="text-[10px] text-muted-foreground w-10 text-right tabular-nums shrink-0">{Math.round(pct)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recent transactions */}
                <div className={data.byAccount.length <= 1 && data.byTag.length === 0 ? "lg:col-span-2" : ""}>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Recent transactions</p>
                  <div className="space-y-0 rounded-md border border-border/40 overflow-hidden">
                    {data.recentTransactions.slice(0, 10).map((txn, i) => (
                      <div key={txn.id} className={cn(
                        "flex items-center gap-2.5 py-2 px-3 transition-colors hover:bg-muted/20",
                        i < data.recentTransactions.length - 1 && "border-b border-border/30"
                      )}>
                        <span className="text-[11px] text-muted-foreground w-14 shrink-0 tabular-nums">{formatShortDate(txn.date)}</span>
                        <span className="text-sm flex-1 min-w-0 truncate">{txn.displayName || txn.description}</span>
                        <span className="text-[11px] text-muted-foreground hidden sm:block shrink-0">{txn.accountName}</span>
                        <MoneyDisplay amount={txn.amount} className="text-sm font-medium shrink-0 tabular-nums" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
