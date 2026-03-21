"use client";

import {
  BarChart, Bar,
  AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserPreferences } from "@/lib/user-preferences-context";
import { formatMoney, fromCents } from "@/lib/money";
import { t, type Language } from "@/lib/translations";

// ── Color palette for expense groups ────────────────────────────────

const EXPENSE_GROUP_COLORS = [
  "hsl(0, 72%, 51%)",       // red
  "hsl(25, 95%, 53%)",      // orange
  "hsl(45, 93%, 47%)",      // amber
  "hsl(142, 71%, 45%)",     // green
  "hsl(199, 89%, 48%)",     // blue
  "hsl(271, 81%, 56%)",     // purple
  "hsl(330, 81%, 60%)",     // pink
  "hsl(174, 72%, 40%)",     // teal
];

// ── Shared helpers ──────────────────────────────────────────────────

function abbreviateAmount(cents: number, locale: string, currency: string): string {
  const val = fromCents(Math.abs(cents));
  const sign = cents < 0 ? "-" : "";
  if (val >= 1_000_000) return `${sign}${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${sign}${Math.round(val / 1_000)}K`;
  return formatMoney(cents, currency, locale);
}

function MoneyTooltipRow({ label, value, color, locale, currency }: {
  label: string; value: number; color?: string; locale: string; currency: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-1.5">
        {color && <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />}
        <span className="text-muted-foreground">{label}</span>
      </span>
      <span className="font-semibold tabular-nums">{formatMoney(value, currency, locale)}</span>
    </div>
  );
}

// ── Chart 1: Macro Overview ─────────────────────────────────────────

interface TrendMonth {
  year: number; month: number; label: string;
  income: number; expenses: number; net: number;
  savingsRate: number; monthlyFundBudget: number;
}

interface MacroOverviewChartProps {
  data: TrendMonth[];
  lang: Language;
}

export function MacroOverviewChart({ data, lang }: MacroOverviewChartProps) {
  const { preferences } = useUserPreferences();
  const locale = preferences.locale;

  if (data.length === 0) {
    return <EmptyChartCard title={t(lang, "dashboard.macroOverview")} />;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{t(lang, "dashboard.macroOverview")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
              <YAxis
                tickFormatter={(v: number) => abbreviateAmount(v, locale, "EUR")}
                tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                className="fill-muted-foreground" width={52}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as TrendMonth;
                  return (
                    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-1">
                      <p className="font-semibold">{label}</p>
                      <MoneyTooltipRow label={t(lang, "dashboard.income")} value={d.income} color="hsl(142, 71%, 45%)" locale={locale} currency="EUR" />
                      <MoneyTooltipRow label={t(lang, "dashboard.expenses")} value={d.expenses} color="hsl(0, 72%, 51%)" locale={locale} currency="EUR" />
                      <MoneyTooltipRow label={t(lang, "dashboard.fundAllocations")} value={d.monthlyFundBudget} color="hsl(45, 93%, 47%)" locale={locale} currency="EUR" />
                    </div>
                  );
                }}
              />
              <Legend
                iconType="square"
                iconSize={10}
                wrapperStyle={{ fontSize: 11 }}
              />
              <Bar dataKey="income" name={t(lang, "dashboard.income")} fill="hsl(142, 71%, 45%)" radius={[2, 2, 0, 0]} />
              <Bar dataKey="expenses" name={t(lang, "dashboard.expenses")} fill="hsl(0, 72%, 51%)" radius={[2, 2, 0, 0]} />
              <Bar dataKey="monthlyFundBudget" name={t(lang, "dashboard.fundAllocations")} fill="hsl(45, 93%, 47%)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Chart 2: Expense Breakdown by Category Group ────────────────────

interface ExpenseGroup {
  groupId: string;
  groupName: string;
  amount: number;
}

interface ExpenseByGroupMonth {
  year: number; month: number; label: string;
  groups: ExpenseGroup[];
}

interface ExpenseBreakdownChartProps {
  data: ExpenseByGroupMonth[];
  lang: Language;
}

export function ExpenseBreakdownChart({ data, lang }: ExpenseBreakdownChartProps) {
  const { preferences } = useUserPreferences();
  const locale = preferences.locale;

  if (data.length === 0) {
    return <EmptyChartCard title={t(lang, "dashboard.expenseBreakdown")} />;
  }

  // Collect all unique groups across all months, sorted by total descending
  const groupTotals = new Map<string, { groupId: string; groupName: string; total: number }>();
  for (const month of data) {
    for (const g of month.groups) {
      const entry = groupTotals.get(g.groupId) ?? { groupId: g.groupId, groupName: g.groupName, total: 0 };
      entry.total += g.amount;
      groupTotals.set(g.groupId, entry);
    }
  }
  const sortedGroups = Array.from(groupTotals.values()).sort((a, b) => b.total - a.total);

  // Build chart data: flatten groups into columns per month
  const chartData = data.map((month) => {
    const row: Record<string, string | number> = { label: month.label };
    for (const g of sortedGroups) {
      const found = month.groups.find((mg) => mg.groupId === g.groupId);
      row[g.groupId] = found?.amount ?? 0;
    }
    return row;
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{t(lang, "dashboard.expenseBreakdown")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
              <YAxis
                tickFormatter={(v: number) => abbreviateAmount(v, locale, "EUR")}
                tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                className="fill-muted-foreground" width={52}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-1 max-h-64 overflow-y-auto">
                      <p className="font-semibold">{label}</p>
                      {payload.filter((p) => (p.value as number) > 0).map((p) => {
                        const group = sortedGroups.find((g) => g.groupId === p.dataKey);
                        return (
                          <MoneyTooltipRow
                            key={p.dataKey as string}
                            label={group?.groupName ?? (p.dataKey as string)}
                            value={p.value as number}
                            color={p.color}
                            locale={locale}
                            currency="EUR"
                          />
                        );
                      })}
                    </div>
                  );
                }}
              />
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              {sortedGroups.slice(0, EXPENSE_GROUP_COLORS.length).map((group, i) => (
                <Bar
                  key={group.groupId}
                  dataKey={group.groupId}
                  name={group.groupName}
                  fill={EXPENSE_GROUP_COLORS[i]}
                  stackId="expenses"
                  radius={i === 0 ? [2, 2, 0, 0] : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Chart 3: Fund Balance Evolution ─────────────────────────────────

interface FundHistoryPoint {
  year: number; month: number; label: string;
  totalAvailable: number;
}

interface FundEvolutionChartProps {
  data: FundHistoryPoint[];
  lang: Language;
}

export function FundEvolutionChart({ data, lang }: FundEvolutionChartProps) {
  const { preferences } = useUserPreferences();
  const locale = preferences.locale;

  if (data.length === 0 || data.every((d) => d.totalAvailable === 0)) {
    return <EmptyChartCard title={t(lang, "dashboard.fundEvolution")} />;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{t(lang, "dashboard.fundEvolution")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fundGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(174, 72%, 40%)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(174, 72%, 40%)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
              <YAxis
                tickFormatter={(v: number) => abbreviateAmount(v, locale, "EUR")}
                tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                className="fill-muted-foreground" width={52}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as FundHistoryPoint;
                  return (
                    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-1">
                      <p className="font-semibold">{label}</p>
                      <MoneyTooltipRow label={t(lang, "dashboard.fundEvolution")} value={d.totalAvailable} color="hsl(174, 72%, 40%)" locale={locale} currency="EUR" />
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="totalAvailable"
                stroke="hsl(174, 72%, 40%)"
                strokeWidth={2}
                fill="url(#fundGradient)"
                dot={{ r: 3, fill: "hsl(174, 72%, 40%)" }}
                activeDot={{ r: 4, fill: "hsl(174, 72%, 40%)" }}
                isAnimationActive
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Empty state ─────────────────────────────────────────────────────

function EmptyChartCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48 sm:h-64 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No data available.</p>
        </div>
      </CardContent>
    </Card>
  );
}
