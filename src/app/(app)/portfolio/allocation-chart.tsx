"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatMoney } from "@/lib/money";
import { MoneyDisplay } from "@/components/shared/money-display";

// Literal colors: theme CSS vars hold full hex values, so hsl(var(--…))
// would silently produce black (see the Reports chart bug).
const ASSET_TYPE_COLORS: Record<string, string> = {
  STOCK: "#6366f1",
  ETF: "#10b981",
  BOND: "#0ea5e9",
  CRYPTO: "#f59e0b",
  COMMODITY: "#a855f7",
  FUND: "#14b8a6",
  CFD: "#ef4444",
  OTHER: "#6b7280",
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  STOCK: "Stocks",
  ETF: "ETFs",
  BOND: "Bonds",
  CRYPTO: "Crypto",
  COMMODITY: "Commodities",
  FUND: "Funds",
  CFD: "CFDs",
  OTHER: "Other",
};

export interface AllocationSlice {
  type: string;
  valueEurCents: number;
  percentage: number;
}

export function AllocationChart({
  allocation,
  totalValueEurCents,
  locale,
}: {
  allocation: AllocationSlice[];
  totalValueEurCents: number;
  locale?: string;
}) {
  if (allocation.length === 0) return null;

  const data = allocation.map((a) => ({
    name: ASSET_TYPE_LABELS[a.type] ?? a.type,
    type: a.type,
    value: a.valueEurCents / 100,
    percentage: a.percentage,
  }));

  return (
    <div>
      <div className="relative h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="90%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((entry) => (
                <Cell key={entry.type} fill={ASSET_TYPE_COLORS[entry.type] ?? ASSET_TYPE_COLORS.OTHER} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
              formatter={(value, name) => [
                formatMoney(Math.round(Number(value ?? 0) * 100), "EUR", locale),
                String(name),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <MoneyDisplay
            amount={totalValueEurCents}
            colorize={false}
            className="text-sm font-bold"
          />
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 space-y-1">
        {data.map((entry) => (
          <div key={entry.type} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: ASSET_TYPE_COLORS[entry.type] ?? ASSET_TYPE_COLORS.OTHER }}
            />
            <span className="flex-1 text-muted-foreground">{entry.name}</span>
            <span className="tabular-nums text-muted-foreground">{entry.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
