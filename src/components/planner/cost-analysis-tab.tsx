"use client";

import { useState, useMemo } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { MoneyDisplay } from "@/components/shared/money-display";
import { cn } from "@/lib/utils";
import { Loader2, ChevronDown, PieChart } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { fromCents } from "@/lib/money";

interface CostAnalysisTabProps {
  month: number;
  year: number;
  visibility: "SHARED" | "PERSONAL";
}

const PERIOD_PRESETS = [
  { label: "Last 12 mo", getRange: () => { const d = new Date(); d.setMonth(d.getMonth() - 12); return { from: d, to: undefined }; } },
  { label: "This year", getRange: () => ({ from: new Date(new Date().getFullYear(), 0, 1), to: undefined }) },
  { label: "Last 6 mo", getRange: () => { const d = new Date(); d.setMonth(d.getMonth() - 6); return { from: d, to: undefined }; } },
  { label: "All time", getRange: () => ({ from: undefined, to: undefined }) },
];

export function CostAnalysisTab({ visibility }: CostAnalysisTabProps) {
  const trpc = useTRPC();

  const categoryTreeQuery = useQuery(
    trpc.category.tree.queryOptions({ visibility })
  );
  const groups = categoryTreeQuery.data ?? [];

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [periodIdx, setPeriodIdx] = useState(0);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);

  // When a group is selected, auto-select all its children
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const activeCatIds = useMemo(() => {
    if (selectedCatIds.length > 0) return selectedCatIds;
    if (selectedGroup) return selectedGroup.children.map((c) => c.id);
    return [];
  }, [selectedGroup, selectedCatIds]);

  const period = PERIOD_PRESETS[periodIdx].getRange();

  const analysisQuery = useQuery({
    ...trpc.category.costAnalysis.queryOptions({
      categoryIds: activeCatIds,
      dateFrom: period.from,
      dateTo: period.to,
      visibility,
    }),
    enabled: activeCatIds.length > 0,
  });

  const data = analysisQuery.data;
  const hasIncome = (data?.totalIncome ?? 0) > 0;

  // Quick-pick presets from category groups that have children
  const quickPicks = useMemo(() => {
    return groups.filter((g) => g.children.length > 0 && g._count.transactions > 0);
  }, [groups]);

  const selectGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    setSelectedCatIds([]);
    setGroupDropdownOpen(false);
  };

  const toggleCat = (catId: string) => {
    setSelectedCatIds((prev) => {
      const next = prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId];
      if (next.length === 0 && selectedGroupId) return []; // fall back to group
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* ── Selector ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Group dropdown */}
        <div className="relative">
          <button
            onClick={() => setGroupDropdownOpen(!groupDropdownOpen)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors min-w-[180px]",
              selectedGroup ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/50"
            )}
          >
            <PieChart className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="flex-1 text-left truncate">
              {selectedGroup ? `${selectedGroup.icon ?? ""} ${selectedGroup.name}`.trim() : "Select category group..."}
            </span>
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", groupDropdownOpen && "rotate-180")} />
          </button>
          {groupDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setGroupDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg min-w-[220px] max-h-[320px] overflow-y-auto p-1.5">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => selectGroup(g.id)}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-1.5 rounded text-sm text-left transition-colors",
                      selectedGroupId === g.id ? "bg-primary/10 font-medium" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {g.icon && <span className="text-sm">{g.icon}</span>}
                    <span className="flex-1 truncate">{g.name}</span>
                    <span className="text-[10px] text-muted-foreground/50 tabular-nums">{g.children.length}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Period presets */}
        <div className="flex gap-1">
          {PERIOD_PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => setPeriodIdx(i)}
              className={cn(
                "text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors",
                periodIdx === i ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category pills (when group is selected) */}
      {selectedGroup && (
        <div className="flex flex-wrap gap-1.5">
          {selectedGroup.children.map((cat) => {
            const isActive = selectedCatIds.length === 0 || selectedCatIds.includes(cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => toggleCat(cat.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  isActive
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground/50 hover:text-muted-foreground"
                )}
              >
                {cat.icon && <span>{cat.icon}</span>}
                {cat.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Quick picks (when no group selected) */}
      {!selectedGroupId && quickPicks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground py-1">Quick analysis:</span>
          {quickPicks.map((g) => (
            <button
              key={g.id}
              onClick={() => selectGroup(g.id)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
            >
              {g.icon && <span>{g.icon}</span>}
              {g.name}
            </button>
          ))}
        </div>
      )}

      {/* ── No selection ──────────────────────────────────────── */}
      {activeCatIds.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Select a category group or individual categories to analyze.
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────── */}
      {activeCatIds.length > 0 && analysisQuery.isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Analysis results ─────────────────────────────────── */}
      {data && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className={cn("grid gap-3", hasIncome ? "grid-cols-4" : "grid-cols-3")}>
            {hasIncome && (
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Gross cost</p>
                <MoneyDisplay amount={data.totalExpenses} colorize={false} className="text-lg font-bold text-red-600 dark:text-red-400" />
              </div>
            )}
            {hasIncome && (
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Subsidy / income</p>
                <MoneyDisplay amount={data.totalIncome} colorize={false} className="text-lg font-bold text-green-600 dark:text-green-400" />
              </div>
            )}
            <div className="rounded-lg border bg-card p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                {hasIncome ? "Net cost" : "Total expenses"}
              </p>
              <MoneyDisplay amount={data.netCost} className="text-lg font-bold" />
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Monthly average</p>
              <MoneyDisplay amount={data.monthlyAverage} className="text-lg font-bold" />
              <span className="text-[10px] text-muted-foreground">/mo</span>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Transactions</p>
              <p className="text-lg font-bold">{data.transactionCount}</p>
              <span className="text-[10px] text-muted-foreground">{data.monthsSpanned} month{data.monthsSpanned !== 1 ? "s" : ""}</span>
            </div>
          </div>

          {data.transactionCount === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No transactions found for the selected categories and period.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Category breakdown */}
              {data.byCategory.length > 1 && (
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">By category</p>
                  <div className="space-y-1.5">
                    {data.byCategory.map((cat) => {
                      const pct = data.netCost !== 0 ? Math.abs(cat.totalAmount / data.netCost) * 100 : 0;
                      return (
                        <div key={cat.categoryId} className="flex items-center gap-2">
                          <span className="text-sm w-5 shrink-0">{cat.categoryIcon ?? "📄"}</span>
                          <span className="text-sm flex-1 min-w-0 truncate">{cat.categoryName}</span>
                          <MoneyDisplay amount={cat.totalAmount} className="text-sm font-medium shrink-0 tabular-nums whitespace-nowrap" />
                          <span className="text-[10px] text-muted-foreground w-10 text-right tabular-nums shrink-0">{Math.round(pct)}%</span>
                          <div className="w-16 h-1.5 rounded-full bg-muted shrink-0 hidden sm:block">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Merchant breakdown */}
              <div className="rounded-lg border bg-card p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">By merchant</p>
                <div className="space-y-1.5">
                  {data.byMerchant.map((m) => (
                    <div key={m.name} className="flex items-center gap-2">
                      <span className="text-sm flex-1 min-w-0 truncate">{m.name}</span>
                      <MoneyDisplay amount={m.totalAmount} className="text-sm font-medium shrink-0 tabular-nums whitespace-nowrap" />
                      <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                        {m.count} txn{m.count !== 1 ? "s" : ""}
                      </span>
                      {data.monthsSpanned > 1 && (
                        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums hidden sm:block">
                          ~{(Math.abs(fromCents(m.totalAmount)) / data.monthsSpanned).toFixed(0)}/mo
                        </span>
                      )}
                    </div>
                  ))}
                  {data.byMerchant.length === 0 && (
                    <p className="text-xs text-muted-foreground/50 text-center py-2">No merchants found</p>
                  )}
                </div>
              </div>

              {/* Monthly trend */}
              {data.byMonth.length > 1 && (
                <div className="lg:col-span-2 rounded-lg border bg-card p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">Monthly trend</p>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.byMonth.map((m) => ({
                        label: m.label,
                        expenses: Math.abs(fromCents(m.expenses)),
                        ...(hasIncome && { income: fromCents(m.income) }),
                      }))}>
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }} />
                        <Bar dataKey="expenses" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} name="Expenses" />
                        {hasIncome && <Bar dataKey="income" fill="hsl(142 71% 45%)" radius={[3, 3, 0, 0]} name="Income" />}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Account breakdown */}
              {data.byAccount.length > 1 && (
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">By account</p>
                  <div className="space-y-1.5">
                    {data.byAccount.map((acc) => {
                      const pct = data.netCost !== 0 ? Math.abs(acc.totalAmount / data.netCost) * 100 : 0;
                      return (
                        <div key={acc.accountId} className="flex items-center gap-2">
                          <span className="text-sm flex-1 min-w-0 truncate">{acc.accountName}</span>
                          <MoneyDisplay amount={acc.totalAmount} className="text-sm font-medium shrink-0 tabular-nums whitespace-nowrap" />
                          <span className="text-[10px] text-muted-foreground w-10 text-right tabular-nums shrink-0">{Math.round(pct)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
