"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MoneyDisplay } from "@/components/shared/money-display";
import { Check } from "lucide-react";
import { t, type Language } from "@/lib/translations";

interface FundData {
  id: string;
  name: string;
  icon: string | null;
  target: number | null;
  available: number;
  thisMonthBudget: number;
  thisMonthActual: number;
}

interface FundProgressSectionProps {
  funds: FundData[];
  lang: Language;
}

export function FundProgressSection({ funds, lang }: FundProgressSectionProps) {
  if (funds.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            {t(lang, "dashboard.noFunds")}
          </p>
          <Link
            href="/tracker"
            className="text-sm font-medium text-primary hover:underline"
          >
            {t(lang, "dashboard.goToTracker")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        {t(lang, "dashboard.fundProgress")}
      </h2>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {funds.map((fund) => (
          <FundCard key={fund.id} fund={fund} lang={lang} />
        ))}
      </div>
    </div>
  );
}

function FundCard({ fund, lang }: { fund: FundData; lang: Language }) {
  const hasTarget = fund.target !== null && fund.target > 0;
  const isCompleted = hasTarget && fund.available >= fund.target!;
  const progressPercent = hasTarget ? (fund.available / fund.target!) * 100 : 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3 space-y-2">
        <p className="text-sm font-medium truncate">
          {fund.icon && <span className="mr-1">{fund.icon}</span>}
          {fund.name}
        </p>

        {hasTarget ? (
          <>
            <Progress
              value={Math.min(progressPercent, 100)}
              max={100}
              className="h-2"
              indicatorClassName={isCompleted ? "bg-green-500" : "bg-primary"}
            />
            <div className="flex items-center justify-between gap-1">
              <MoneyDisplay amount={fund.available} className="text-sm font-semibold" colorize={false} />
              {isCompleted ? (
                <span className="flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400">
                  <Check className="h-3 w-3" />
                  {t(lang, "dashboard.completed")}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {t(lang, "dashboard.ofTarget").replace(
                    "{target}",
                    ""
                  )}
                  <MoneyDisplay amount={fund.target!} className="text-xs inline" colorize={false} />
                </span>
              )}
            </div>
          </>
        ) : (
          <div>
            <MoneyDisplay amount={fund.available} className="text-sm font-semibold" colorize={false} />
            <p className="text-xs text-muted-foreground">{t(lang, "dashboard.noTarget")}</p>
          </div>
        )}

        {fund.thisMonthBudget > 0 && (
          <p className="text-xs text-muted-foreground">
            +<MoneyDisplay amount={fund.thisMonthBudget} className="text-xs inline" colorize={false} /> {t(lang, "dashboard.thisMonth").toLowerCase()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
