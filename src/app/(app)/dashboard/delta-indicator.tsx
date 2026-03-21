"use client";

import { MoneyDisplay } from "@/components/shared/money-display";
import { cn } from "@/lib/utils";

interface DeltaIndicatorProps {
  /** The change amount in cents (or percentage points if isPercentagePoints) */
  value: number;
  /** The % change */
  percentage: number;
  /** When true, positive = bad (e.g., expenses going up) */
  invertColor?: boolean;
  /** When true, show "pp" instead of "%" */
  isPercentagePoints?: boolean;
  /** Label shown after the delta (e.g., "vs last month") */
  label?: string;
}

export function DeltaIndicator({
  value,
  percentage,
  invertColor = false,
  isPercentagePoints = false,
  label,
}: DeltaIndicatorProps) {
  const isPositive = value > 0;
  const isGood = invertColor ? !isPositive : isPositive;
  const isZero = value === 0;

  const arrow = isZero ? "" : isPositive ? "\u2191" : "\u2193";
  const sign = isPositive ? "+" : "";
  const unit = isPercentagePoints ? "pp" : "%";

  return (
    <span
      className={cn(
        "text-xs font-medium",
        isZero && "text-muted-foreground",
        !isZero && isGood && "text-green-600 dark:text-green-400",
        !isZero && !isGood && "text-red-600 dark:text-red-400"
      )}
    >
      {arrow}{" "}
      {isPercentagePoints ? (
        <>{sign}{Math.abs(percentage).toFixed(0)}{unit}</>
      ) : (
        <>
          <MoneyDisplay amount={Math.abs(value)} className="text-xs font-medium inline" colorize={false} />
          {" "}({sign}{percentage.toFixed(0)}%)
        </>
      )}
      {label && <span className="text-muted-foreground ml-1">{label}</span>}
    </span>
  );
}
