"use client";

import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useUserPreferences } from "@/lib/user-preferences-context";

interface MoneyDisplayProps {
  amount: number; // cents
  currency?: string;
  className?: string;
  colorize?: boolean; // green for positive, red for negative
  showSign?: boolean;
}

export function MoneyDisplay({
  amount,
  currency = "EUR",
  className,
  colorize = true,
  showSign = false,
}: MoneyDisplayProps) {
  const { preferences } = useUserPreferences();
  const formatted = formatMoney(Math.abs(amount), currency, preferences.locale);
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
  const display = showSign ? `${sign}${formatted}` : (amount < 0 ? `-${formatted}` : formatted);

  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        colorize && amount > 0 && "text-green-600 dark:text-green-400",
        colorize && amount < 0 && "text-red-600 dark:text-red-400",
        className
      )}
    >
      {display}
    </span>
  );
}
