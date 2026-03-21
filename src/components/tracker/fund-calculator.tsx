"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogHeader, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyDisplay } from "@/components/shared/money-display";
import { fromCents, toCents } from "@/lib/money";
import { t, type Language } from "@/lib/translations";
import { toast } from "sonner";
import { Plus, Trash2, Calculator } from "lucide-react";

interface LineItemData {
  id: string;
  description: string;
  period: number;
  amount: number; // cents
  sortOrder: number;
}

interface BudgetCalculatorProps {
  entityId: string;
  entityName: string;
  entityType: "fund" | "category";
  trackerId?: string; // required for category type
  initialItems: LineItemData[];
  open: boolean;
  onClose: () => void;
  lang: Language;
  onApplyBudget?: (computedMonthly: number) => void;
}

// Backward-compatible props for fund-only usage
interface FundCalculatorProps {
  fundId: string;
  fundName: string;
  initialItems: LineItemData[];
  open: boolean;
  onClose: () => void;
  lang: Language;
  onApplyBudget?: (computedMonthly: number) => void;
}

interface CalcRow {
  id: string;
  description: string;
  period: number;
  amount: string; // display string for input
}

const PERIOD_OPTIONS = [
  { value: 1, label: "1x" },
  { value: 2, label: "2x" },
  { value: 4, label: "4x" },
  { value: 6, label: "6x" },
  { value: 12, label: "12x" },
  { value: 24, label: "24x" },
  { value: 52, label: "52x" },
];

export function BudgetCalculator({
  entityId,
  entityName,
  entityType,
  trackerId,
  initialItems,
  open,
  onClose,
  lang,
  onApplyBudget,
}: BudgetCalculatorProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [rows, setRows] = useState<CalcRow[]>(() => {
    if (initialItems.length > 0) {
      return initialItems.map((li) => ({
        id: li.id,
        description: li.description,
        period: li.period,
        amount: li.amount > 0 ? fromCents(li.amount).toFixed(2) : "",
      }));
    }
    return [{ id: crypto.randomUUID(), description: "", period: 1, amount: "" }];
  });

  const fundMutation = useMutation(
    trpc.fund.setLineItems.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries();
        toast.success(
          `${t(lang, "tracker.funds.calculator")}: ${fromCents(data.computedMonthly).toFixed(2)}/${t(lang, "tracker.funds.monthly")}`
        );
        onApplyBudget?.(data.computedMonthly);
        onClose();
      },
    })
  );

  const categoryMutation = useMutation(
    trpc.category.setLineItems.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries();
        toast.success(
          `${t(lang, "tracker.funds.calculator")}: ${fromCents(data.computedMonthly).toFixed(2)}/${t(lang, "tracker.funds.monthly")}`
        );
        onApplyBudget?.(data.computedMonthly);
        onClose();
      },
    })
  );

  const mutation = entityType === "fund" ? fundMutation : categoryMutation;

  const updateRow = (id: string, field: keyof CalcRow, value: string | number) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: "", period: 1, amount: "" },
    ]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const getRowYearly = (row: CalcRow): number => {
    const amountCents = toCents(parseFloat(row.amount) || 0);
    return row.period * amountCents;
  };

  const yearlyTotal = rows.reduce((sum, row) => sum + getRowYearly(row), 0);
  const monthlyCents = Math.round(yearlyTotal / 12);

  const handleApply = () => {
    const validRows = rows.filter(
      (r) => r.description.trim() && parseFloat(r.amount) > 0
    );
    const items = validRows.map((r, i) => ({
      description: r.description.trim(),
      period: r.period,
      amount: toCents(parseFloat(r.amount) || 0),
      sortOrder: i,
    }));

    if (entityType === "fund") {
      fundMutation.mutate({ fundId: entityId, items });
    } else {
      categoryMutation.mutate({ categoryId: entityId, trackerId: trackerId!, items });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          <span className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            {t(lang, "tracker.funds.calculator")}: {entityName}
          </span>
        </DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-3">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_100px_100px_90px_32px] gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
            <span>{t(lang, "tracker.funds.description")}</span>
            <span>{t(lang, "tracker.funds.period")}</span>
            <span className="text-right">{t(lang, "tracker.funds.amount")}</span>
            <span className="text-right">{t(lang, "tracker.funds.yearly")}</span>
            <span />
          </div>

          {/* Rows */}
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_100px_100px_90px_32px] gap-2 items-center"
            >
              <Input
                value={row.description}
                onChange={(e) => updateRow(row.id, "description", e.target.value)}
                placeholder={t(lang, "tracker.funds.description")}
                className="h-8 text-sm"
              />
              <select
                value={row.period}
                onChange={(e) =>
                  updateRow(row.id, "period", parseInt(e.target.value))
                }
                className="h-8 rounded-md border bg-transparent px-2 text-sm"
              >
                {PERIOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}/{t(lang, "tracker.funds.perYear")}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={row.amount}
                onChange={(e) => updateRow(row.id, "amount", e.target.value)}
                placeholder="0.00"
                className="h-8 text-sm text-right font-mono tabular-nums"
              />
              <div className="text-right">
                <MoneyDisplay
                  amount={getRowYearly(row)}
                  colorize={false}
                  className="text-xs font-mono tabular-nums"
                />
              </div>
              {rows.length > 1 ? (
                <button
                  onClick={() => removeRow(row.id)}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-600 transition-colors"
                  aria-label="Remove line"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : (
                <div />
              )}
            </div>
          ))}

          {/* Add row button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={addRow}
          >
            <Plus className="h-3 w-3" />
            {t(lang, entityType === "fund" ? "tracker.funds.addLine" : "tracker.funds.addItem")}
          </Button>

          {/* Totals */}
          <div className="border-t pt-3 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t(lang, "tracker.funds.yearlyTotal")}:
              </span>
              <MoneyDisplay
                amount={yearlyTotal}
                colorize={false}
                className="text-sm font-semibold font-mono tabular-nums"
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t(lang, "tracker.funds.monthly")}:
              </span>
              <MoneyDisplay
                amount={monthlyCents}
                colorize={false}
                className="text-sm font-bold font-mono tabular-nums"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t(lang, "common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={mutation.isPending}
              className="gap-1"
            >
              {t(lang, "tracker.funds.apply")}{" "}
              <MoneyDisplay
                amount={monthlyCents}
                colorize={false}
                className="text-xs inline"
              />
            </Button>
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
}

/** Backward-compatible wrapper — fund-only usage */
export function FundCalculator({
  fundId,
  fundName,
  initialItems,
  open,
  onClose,
  lang,
  onApplyBudget,
}: FundCalculatorProps) {
  return (
    <BudgetCalculator
      entityId={fundId}
      entityName={fundName}
      entityType="fund"
      initialItems={initialItems}
      open={open}
      onClose={onClose}
      lang={lang}
      onApplyBudget={onApplyBudget}
    />
  );
}
