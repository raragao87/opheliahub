"use client";

import { MoneyDisplay } from "@/components/shared/money-display";
import { cn } from "@/lib/utils";
import { t, type Language } from "@/lib/translations";
import { Settings } from "lucide-react";

// FundData type — matches the shape returned by fund.list
interface FundData {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  balance: number;
  monthlyContribution: number;
  targetAmount: number | null;
  targetDate: Date | null;
  targetProgress: number | null;
  monthsToTarget: number | null;
  thisMonthContribution: number;
  thisMonthWithdrawal: number;
  thisMonthNet: number;
  linkedAccount: { id: string; name: string; balance: number; currency: string } | null;
  sortOrder: number;
}

interface FundCardProps {
  fund: FundData;
  lang: Language;
  onEdit: (fundId: string) => void;
}

export type { FundData };

export function FundCard({ fund, lang, onEdit }: FundCardProps) {
  const hasTarget = fund.targetAmount !== null && fund.targetAmount > 0;
  const hasActivity = fund.thisMonthContribution > 0 || fund.thisMonthWithdrawal > 0;

  // Progress bar color
  const getProgressColor = () => {
    if (!hasTarget || fund.targetProgress === null) return "bg-blue-500";
    // Check if on track: compare balance to expected balance based on time elapsed
    if (fund.targetProgress >= 100) return "bg-green-500";
    if (fund.monthsToTarget !== null && fund.monthsToTarget <= 2 && fund.targetProgress < 80) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2 hover:shadow-sm transition-shadow">
      {/* Header: icon + name + edit */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {fund.icon && <span className="text-base">{fund.icon}</span>}
          <span className="font-medium text-sm">{fund.name}</span>
        </div>
        <button
          onClick={() => onEdit(fund.id)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={t(lang, "tracker.funds.editFund")}
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Balance + monthly contribution */}
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-xs text-muted-foreground">{t(lang, "tracker.funds.balance")}: </span>
          <MoneyDisplay amount={fund.balance} colorize={false} className="text-sm font-semibold" />
        </div>
        {fund.monthlyContribution > 0 && (
          <span className="text-xs text-muted-foreground">
            +<MoneyDisplay amount={fund.monthlyContribution} colorize={false} className="text-xs inline" />/{t(lang, "tracker.funds.monthly")}
          </span>
        )}
      </div>

      {/* Target progress bar */}
      {hasTarget ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {t(lang, "tracker.funds.target")}: <MoneyDisplay amount={fund.targetAmount!} colorize={false} className="text-xs inline" />
              {fund.targetDate && (
                <> by {new Date(fund.targetDate).toLocaleDateString("default", { month: "short", year: "numeric" })}</>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="font-medium">{fund.targetProgress}%</span>
              {fund.monthsToTarget !== null && (
                <span>{fund.monthsToTarget} {t(lang, "tracker.funds.monthsLeft")}</span>
              )}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", getProgressColor())}
              style={{ width: `${Math.min(fund.targetProgress ?? 0, 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground/60">
          {t(lang, "tracker.funds.noTarget")}
        </div>
      )}

      {/* This month's activity */}
      {hasActivity && (
        <div className="text-xs text-muted-foreground">
          {t(lang, "tracker.funds.thisMonth")}:{" "}
          {fund.thisMonthContribution > 0 && (
            <span className="text-green-600 dark:text-green-400">
              +<MoneyDisplay amount={fund.thisMonthContribution} colorize={false} className="text-xs inline" /> {t(lang, "tracker.funds.contributed")}
            </span>
          )}
          {fund.thisMonthContribution > 0 && fund.thisMonthWithdrawal > 0 && ", "}
          {fund.thisMonthWithdrawal > 0 && (
            <span className="text-red-600 dark:text-red-400">
              -<MoneyDisplay amount={fund.thisMonthWithdrawal} colorize={false} className="text-xs inline" /> {t(lang, "tracker.funds.spent")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
