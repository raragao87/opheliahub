"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { MoneyDisplay } from "@/components/shared/money-display";
import { cn } from "@/lib/utils";
import { Loader2, TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { fromCents } from "@/lib/money";

interface ReportsTabProps {
  month: number;
  year: number;
  visibility: "SHARED" | "PERSONAL";
}

function getMonthLabel(year: number, month: number) {
  return new Date(year, month - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function getPrevMonth(year: number, month: number) {
  const d = new Date(year, month - 2, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function DeltaChip({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (Math.abs(value) < 0.5) return <span className="text-[10px] text-muted-foreground">—</span>;
  const isPositive = value > 0;
  return (
    <span className={cn("text-[10px] font-medium inline-flex items-center gap-0.5",
      isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
    )}>
      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isPositive ? "+" : ""}{value.toFixed(suffix === "pp" ? 1 : 0)}{suffix}
    </span>
  );
}

export function ReportsTab({ month, year, visibility }: ReportsTabProps) {
  const trpc = useTRPC();
  const prev = getPrevMonth(year, month);
  const [compareEnabled, setCompareEnabled] = useState(true);

  const reviewQuery = useQuery(
    trpc.dashboard.monthlyReview.queryOptions({
      year, month, visibility,
      ...(compareEnabled && { compareYear: prev.year, compareMonth: prev.month }),
    })
  );

  const data = reviewQuery.data;
  const current = data?.current;
  const compare = data?.compare;
  const deltas = data?.deltas;
  const trends = data?.trends;

  if (reviewQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!current) {
    return <p className="text-sm text-muted-foreground text-center py-12">No data available for this month.</p>;
  }

  return (
    <div className="space-y-4">
      {/* ── Period header ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold">{getMonthLabel(year, month)}</span>
        {compare && (
          <>
            <span className="text-muted-foreground">vs.</span>
            <span className="text-muted-foreground">{getMonthLabel(prev.year, prev.month)}</span>
          </>
        )}
        <button
          onClick={() => setCompareEnabled(!compareEnabled)}
          className="ml-2 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          {compareEnabled ? "Hide comparison" : "Show comparison"}
        </button>
      </div>

      {/* ── Summary cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Income */}
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Income</p>
          <MoneyDisplay amount={current.totalIncome} colorize={false} className="text-lg font-bold text-green-600 dark:text-green-400" />
          {deltas && <DeltaChip value={fromCents(deltas.incomeChange)} />}
        </div>

        {/* Expenses */}
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Expenses</p>
          <MoneyDisplay amount={current.totalExpenses} colorize={false} className="text-lg font-bold text-red-600 dark:text-red-400" />
          {deltas && <DeltaChip value={-fromCents(Math.abs(deltas.expensesChange))} />}
        </div>

        {/* Net savings */}
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Net savings</p>
          <MoneyDisplay
            amount={current.netFlow}
            colorize={false}
            className={cn("text-lg font-bold", current.netFlow >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}
          />
          {deltas && <DeltaChip value={fromCents(deltas.netFlowChange)} />}
        </div>

        {/* Savings rate */}
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Savings rate</p>
          <p className={cn("text-lg font-bold", current.savingsRate >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
            {current.savingsRate.toFixed(1)}%
          </p>
          {deltas && <DeltaChip value={deltas.savingsRateChange} suffix="pp" />}
        </div>
      </div>

      {/* ── 6-month trend ─────────────────────────────────────── */}
      {trends && trends.months.length > 1 && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">Income vs. expenses (6 months)</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends.months.map((m) => ({
                label: m.label,
                income: fromCents(m.income),
                expenses: Math.abs(fromCents(m.expenses)),
              }))}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }} />
                <Bar dataKey="income" fill="hsl(142 71% 45%)" radius={[3, 3, 0, 0]} name="Income" />
                <Bar dataKey="expenses" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Category comparison ────────────────────────────────── */}
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">By category</p>
          {deltas?.categoryChanges && deltas.categoryChanges.length > 0 ? (
            <div className="space-y-1">
              {deltas.categoryChanges.map((cat) => (
                <div key={cat.categoryId ?? "__none__"} className="flex items-center gap-2 py-1">
                  <span className="text-sm w-5 shrink-0">{cat.categoryIcon ?? "📄"}</span>
                  <span className="text-sm flex-1 min-w-0 truncate">{cat.categoryName ?? "Uncategorized"}</span>
                  <MoneyDisplay amount={cat.currentAmount} className="text-xs font-medium shrink-0 tabular-nums whitespace-nowrap w-20 text-right" />
                  {compare && (
                    <>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                      <MoneyDisplay amount={cat.compareAmount} className="text-xs text-muted-foreground shrink-0 tabular-nums whitespace-nowrap w-20 text-right" colorize={false} />
                    </>
                  )}
                  <div className="w-16 shrink-0 text-right">
                    {Math.abs(cat.change) > 50 ? ( // >€0.50 threshold
                      <span className={cn("text-[10px] font-medium",
                        cat.change < 0 ? "text-red-500" : "text-green-500" // more negative = more spending = red
                      )}>
                        {cat.change < 0 ? "" : "+"}{fromCents(cat.change).toFixed(0)}
                      </span>
                    ) : (
                      <Minus className="h-3 w-3 text-muted-foreground/30 inline" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {current.byCategory.map((cat) => (
                <div key={cat.categoryId ?? "__none__"} className="flex items-center gap-2 py-1">
                  <span className="text-sm w-5 shrink-0">{cat.categoryIcon ?? "📄"}</span>
                  <span className="text-sm flex-1 min-w-0 truncate">{cat.categoryName ?? "Uncategorized"}</span>
                  <MoneyDisplay amount={cat.amount} className="text-sm font-medium shrink-0 tabular-nums whitespace-nowrap" />
                </div>
              ))}
            </div>
          )}
          {current.byCategory.length === 0 && (
            <p className="text-xs text-muted-foreground/50 text-center py-3">No expenses this month</p>
          )}
        </div>

        {/* ── Top merchants ──────────────────────────────────────── */}
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">Top expenses</p>
          <div className="space-y-1">
            {current.topMerchants.map((m, i) => (
              <div key={m.name} className="flex items-center gap-2 py-1">
                <span className="text-[10px] text-muted-foreground/50 w-4 text-right shrink-0 tabular-nums">{i + 1}</span>
                <span className="text-sm flex-1 min-w-0 truncate">{m.name}</span>
                {m.count > 1 && <span className="text-[10px] text-muted-foreground shrink-0">{m.count}x</span>}
                <MoneyDisplay amount={m.amount} className="text-sm font-medium shrink-0 tabular-nums whitespace-nowrap" />
              </div>
            ))}
            {current.topMerchants.length === 0 && (
              <p className="text-xs text-muted-foreground/50 text-center py-3">No expenses this month</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
