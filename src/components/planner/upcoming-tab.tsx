"use client";

import { useState, useMemo } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { MoneyDisplay } from "@/components/shared/money-display";
import { Button } from "@/components/ui/button";
import { ACCOUNT_TYPE_META } from "@/lib/account-types";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Plus,
} from "lucide-react";

interface UpcomingTabProps {
  month: number;
  year: number;
  visibility: "SHARED" | "PERSONAL";
}

function formatDay(d: Date | string) {
  const date = new Date(d);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function UpcomingTab({ month, year, visibility }: UpcomingTabProps) {
  const trpc = useTRPC();

  const recurringQuery = useQuery(
    trpc.recurring.listForMonth.queryOptions({ month, year, visibility })
  );

  const accountsQuery = useQuery(trpc.account.list.queryOptions());

  // Local state for dismissed/skipped items
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [manualPaidIds, setManualPaidIds] = useState<Set<string>>(new Set());

  // Sections collapsed state
  const [overdueCollapsed, setOverdueCollapsed] = useState(false);
  const [upcomingCollapsed, setUpcomingCollapsed] = useState(false);
  const [paidCollapsed, setPaidCollapsed] = useState(true);

  const rules = recurringQuery.data?.rules ?? [];
  const summary = recurringQuery.data?.summary;

  // Split into sections
  const { overdue, upcoming, paid } = useMemo(() => {
    const overdue: typeof rules = [];
    const upcoming: typeof rules = [];
    const paid: typeof rules = [];

    for (const rule of rules) {
      if (skippedIds.has(rule.id) || manualPaidIds.has(rule.id)) {
        paid.push(rule);
        continue;
      }
      if (rule.status === "OVERDUE") overdue.push(rule);
      else if (rule.status === "PENDING") upcoming.push(rule);
      else if (rule.status === "PAID") paid.push(rule);
    }

    // Sort by expected due date
    overdue.sort((a, b) => new Date(a.expectedDueDate).getTime() - new Date(b.expectedDueDate).getTime());
    upcoming.sort((a, b) => new Date(a.expectedDueDate).getTime() - new Date(b.expectedDueDate).getTime());
    paid.sort((a, b) => new Date(b.expectedDueDate).getTime() - new Date(a.expectedDueDate).getTime());

    return { overdue, upcoming, paid };
  }, [rules, skippedIds, manualPaidIds]);

  // Cash flow summary
  const cashFlow = useMemo(() => {
    const incomeRules = rules.filter((r) => r.type === "INCOME" && !skippedIds.has(r.id));
    const expenseRules = rules.filter((r) => r.type === "EXPENSE" && !skippedIds.has(r.id));
    const expectedIncome = incomeRules.reduce((s, r) => s + r.amount, 0);
    const expectedExpenses = expenseRules.reduce((s, r) => s + r.amount, 0);
    return {
      expectedIncome,
      expectedExpenses,
      projected: expectedIncome - expectedExpenses,
    };
  }, [rules, skippedIds]);

  // Balance projection
  const liquidBalance = useMemo(() => {
    const accounts = accountsQuery.data ?? [];
    return accounts
      .filter((a) => a.ownership === visibility && ACCOUNT_TYPE_META[a.type]?.sidebarGroup === "SPENDING")
      .reduce((s, a) => s + a.balance, 0);
  }, [accountsQuery.data, visibility]);

  const remainingIncome = useMemo(() => {
    return upcoming.filter((r) => r.type === "INCOME").reduce((s, r) => s + r.amount, 0);
  }, [upcoming]);

  const remainingExpenses = useMemo(() => {
    return upcoming.filter((r) => r.type === "EXPENSE").reduce((s, r) => s + r.amount, 0)
      + overdue.filter((r) => r.type === "EXPENSE").reduce((s, r) => s + r.amount, 0);
  }, [upcoming, overdue]);

  if (recurringQuery.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 rounded-md bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <Calendar className="h-10 w-10 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground">No recurring rules set up yet.</p>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Add recurring rule
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Cash Flow Summary ───────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Expected income</p>
          <MoneyDisplay amount={cashFlow.expectedIncome} colorize={false} className="text-lg font-bold text-green-600 dark:text-green-400" />
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Expected expenses</p>
          <MoneyDisplay amount={-cashFlow.expectedExpenses} colorize={false} className="text-lg font-bold text-red-600 dark:text-red-400" />
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Projected</p>
          <MoneyDisplay
            amount={cashFlow.projected}
            colorize={false}
            className={cn("text-lg font-bold", cashFlow.projected >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}
          />
        </div>
      </div>

      {/* ── Overdue Section ─────────────────────────────────────── */}
      {overdue.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5">
          <button
            onClick={() => setOverdueCollapsed(!overdueCollapsed)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
          >
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
            <span className="text-sm font-semibold text-red-600 dark:text-red-400 flex-1">
              Overdue ({overdue.length})
            </span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", overdueCollapsed && "-rotate-90")} />
          </button>
          {!overdueCollapsed && (
            <div className="border-t border-red-500/20">
              {overdue.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  variant="overdue"
                  onSkip={() => setSkippedIds((s) => new Set(s).add(rule.id))}
                  onMarkPaid={() => setManualPaidIds((s) => new Set(s).add(rule.id))}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Upcoming Section ────────────────────────────────────── */}
      <div className="rounded-lg border bg-card">
        <button
          onClick={() => setUpcomingCollapsed(!upcomingCollapsed)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
        >
          <Calendar className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="text-sm font-semibold flex-1">
            Upcoming ({upcoming.length})
          </span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", upcomingCollapsed && "-rotate-90")} />
        </button>
        {!upcomingCollapsed && (
          <div className="border-t border-border">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground/50 text-center py-6">No upcoming payments this month</p>
            ) : (
              upcoming.map((rule) => (
                <RuleRow key={rule.id} rule={rule} variant="upcoming" />
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Paid Section ────────────────────────────────────────── */}
      {paid.length > 0 && (
        <div className="rounded-lg border bg-card">
          <button
            onClick={() => setPaidCollapsed(!paidCollapsed)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
          >
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <span className="text-sm font-semibold text-muted-foreground flex-1">
              Paid this month ({paid.length})
            </span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", paidCollapsed && "-rotate-90")} />
          </button>
          {!paidCollapsed && (
            <div className="border-t border-border">
              {paid.map((rule) => (
                <RuleRow key={rule.id} rule={rule} variant="paid" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Balance Projection ──────────────────────────────────── */}
      <div className="rounded-lg border bg-card p-4 space-y-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Balance projection</p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Current liquid balance</span>
          <MoneyDisplay amount={liquidBalance} colorize={false} className="font-medium" />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Expected income (remaining)</span>
          <MoneyDisplay amount={remainingIncome} colorize={false} className="font-medium text-green-600 dark:text-green-400" />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Expected expenses (remaining)</span>
          <MoneyDisplay amount={-remainingExpenses} colorize={false} className="font-medium text-red-600 dark:text-red-400" />
        </div>
        <div className="border-t border-border pt-2 flex items-center justify-between text-sm">
          <span className="font-medium">Projected month-end balance</span>
          <MoneyDisplay
            amount={liquidBalance + remainingIncome - remainingExpenses}
            colorize={false}
            className={cn("font-bold", (liquidBalance + remainingIncome - remainingExpenses) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}
          />
        </div>
      </div>
    </div>
  );
}

// ── Rule Row Component ─────────────────────────────────────────────────

interface RuleRowProps {
  rule: {
    id: string;
    name: string;
    amount: number;
    type: string;
    expectedDueDate: Date;
    account: { id: string; name: string };
    category: { id: string; name: string; icon: string | null } | null;
    matchedTransaction: { id: string; amount: number; date: Date; description: string } | null;
    installmentNumber: number | null;
    totalInstallments?: number | null;
  };
  variant: "overdue" | "upcoming" | "paid";
  onSkip?: () => void;
  onMarkPaid?: () => void;
}

function RuleRow({ rule, variant, onSkip, onMarkPaid }: RuleRowProps) {
  const displayAmount = rule.type === "EXPENSE" ? -rule.amount : rule.amount;
  const icon = rule.category?.icon ?? (rule.type === "INCOME" ? "💰" : "📄");

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors",
      variant === "overdue" && "border-l-2 border-l-red-500",
      variant === "upcoming" && "border-l-2 border-l-blue-500",
      variant === "paid" && "border-l-2 border-l-green-500 opacity-70",
    )}>
      {/* Date */}
      <span className={cn(
        "text-xs w-14 shrink-0 tabular-nums",
        variant === "overdue" ? "text-red-500 font-medium" : "text-muted-foreground"
      )}>
        {formatDay(rule.expectedDueDate)}
      </span>

      {/* Icon + Name */}
      <span className="text-sm shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">{rule.name}</span>
        {rule.installmentNumber && rule.totalInstallments && (
          <span className="text-[10px] text-muted-foreground">
            {rule.installmentNumber}/{rule.totalInstallments}
          </span>
        )}
      </div>

      {/* Account */}
      <span className="text-xs text-muted-foreground hidden sm:block shrink-0">{rule.account.name}</span>

      {/* Matched info (paid) */}
      {variant === "paid" && rule.matchedTransaction && (
        <span className="text-[10px] text-green-600 dark:text-green-400 hidden sm:block shrink-0">
          matched {formatDay(rule.matchedTransaction.date)}
        </span>
      )}

      {/* Amount */}
      <MoneyDisplay
        amount={displayAmount}
        colorize={false}
        className={cn(
          "text-sm font-medium shrink-0 tabular-nums whitespace-nowrap",
          rule.type === "INCOME" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
          variant === "paid" && "opacity-70"
        )}
      />

      {/* Actions (overdue only) */}
      {variant === "overdue" && (
        <div className="flex items-center gap-1 shrink-0">
          {onMarkPaid && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={onMarkPaid}>
              Mark paid
            </Button>
          )}
          {onSkip && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-muted-foreground" onClick={onSkip}>
              Skip
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
