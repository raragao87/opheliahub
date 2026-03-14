"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Line,
  LineChart,
} from "recharts";
import { useUserPreferences } from "@/lib/user-preferences-context";
import { formatMoney, fromCents } from "@/lib/money";

interface DataPoint {
  year: number;
  month: number;
  label: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

interface NetWorthTrendChartProps {
  dataPoints: DataPoint[];
  currency?: string;
}

function abbreviateAmount(cents: number, locale: string, currency: string): string {
  const val = fromCents(Math.abs(cents));
  if (val >= 1_000_000) {
    return formatMoney(Math.round(cents / 10_000) * 10_000, currency, locale).replace(/[\d,.]+/, (n) =>
      (parseFloat(n.replace(/[^0-9.]/g, "")) / 100).toFixed(0) + "M"
    );
  }
  if (val >= 1_000) {
    const k = Math.round(val / 1000);
    return (cents < 0 ? "-" : "") + formatMoney(k * 100_000, currency, locale)
      .replace(/[\d,.]+/, k + "K");
  }
  return formatMoney(cents, currency, locale);
}

function CustomTooltip({
  active,
  payload,
  label,
  locale,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; dataKey: string; payload: DataPoint }>;
  label?: string;
  locale: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-1.5">
      <p className="font-semibold">{label}</p>
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">Net Worth</span>
        <span className={`font-semibold ${data.netWorth >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
          {formatMoney(data.netWorth, currency, locale)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">Assets</span>
        <span className="text-green-600 dark:text-green-400">
          {formatMoney(data.totalAssets, currency, locale)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">Liabilities</span>
        <span className="text-red-600 dark:text-red-400">
          {formatMoney(data.totalLiabilities, currency, locale)}
        </span>
      </div>
    </div>
  );
}

export function NetWorthTrendChart({ dataPoints, currency = "EUR" }: NetWorthTrendChartProps) {
  const { preferences } = useUserPreferences();
  const locale = preferences.locale;

  const isPositive = (dataPoints.at(-1)?.netWorth ?? 0) >= 0;
  const fillColor = isPositive ? "#16a34a" : "#dc2626";
  const strokeColor = isPositive ? "#15803d" : "#b91c1c";

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={dataPoints} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={fillColor} stopOpacity={0.25} />
            <stop offset="95%" stopColor={fillColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          className="fill-muted-foreground"
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v: number) => abbreviateAmount(v, locale, currency)}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          className="fill-muted-foreground"
          width={56}
        />
        <Tooltip
          content={<CustomTooltip locale={locale} currency={currency} />}
          cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
        />
        {/* Faint asset line */}
        <Area
          type="monotone"
          dataKey="totalAssets"
          stroke="#16a34a"
          strokeWidth={1}
          strokeDasharray="4 3"
          strokeOpacity={0.4}
          fill="none"
        />
        {/* Faint liability line */}
        <Area
          type="monotone"
          dataKey="totalLiabilities"
          stroke="#dc2626"
          strokeWidth={1}
          strokeDasharray="4 3"
          strokeOpacity={0.4}
          fill="none"
        />
        {/* Main net worth area */}
        <Area
          type="monotone"
          dataKey="netWorth"
          stroke={strokeColor}
          strokeWidth={2}
          fill="url(#netWorthGradient)"
          dot={dataPoints.length <= 6 ? { r: 3, fill: strokeColor } : false}
          activeDot={{ r: 4, fill: strokeColor }}
          isAnimationActive
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Sparkline — minimal, no axes, for dashboard ──────────────────

interface SparklineProps {
  dataPoints: DataPoint[];
  height?: number;
}

export function NetWorthSparkline({ dataPoints, height = 44 }: SparklineProps) {
  const isPositive = (dataPoints.at(-1)?.netWorth ?? 0) >= 0;
  const strokeColor = isPositive ? "#16a34a" : "#dc2626";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={dataPoints} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line
          type="monotone"
          dataKey="netWorth"
          stroke={strokeColor}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
