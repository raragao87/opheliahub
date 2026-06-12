"use client";

import { Link2, Unlink, Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectableCard, SelectableCardGrid } from "@/components/ui/selectable-card";
import { useUserPreferences } from "@/lib/user-preferences-context";
import { t } from "@/lib/translations";

/** Preferences tab — how the app behaves (budgeting and visibility options). */
export function PreferencesTab() {
  const { preferences, updatePreferences } = useUserPreferences();
  const language = preferences.language;

  return (
    <div className="space-y-6">
      {/* ── Intro ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>{t(language, "settings.preferences")}</CardTitle>
              <CardDescription>{t(language, "settings.preferencesDesc")}</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* ── Budget months ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t(language, "settings.budgetMonths")}</CardTitle>
          <CardDescription>{t(language, "settings.budgetMonthsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SelectableCardGrid cols={2}>
            <SelectableCard
              selected={preferences.budgetMonthsLinked}
              onSelect={() => updatePreferences({ budgetMonthsLinked: true })}
              icon={<Link2 className="h-4 w-4" />}
              title={t(language, "budgetMonths.linked")}
              description={t(language, "budgetMonths.linkedDesc")}
            />
            <SelectableCard
              selected={!preferences.budgetMonthsLinked}
              onSelect={() => updatePreferences({ budgetMonthsLinked: false })}
              icon={<Unlink className="h-4 w-4" />}
              title={t(language, "budgetMonths.independent")}
              description={t(language, "budgetMonths.independentDesc")}
            />
          </SelectableCardGrid>
        </CardContent>
      </Card>

      {/* ── Investment visibility ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t(language, "settings.showInvestment")}</CardTitle>
          <CardDescription>{t(language, "settings.showInvestmentDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SelectableCardGrid cols={2}>
            <SelectableCard
              selected={preferences.showInvestment}
              onSelect={() => updatePreferences({ showInvestment: true })}
              icon={<Eye className="h-4 w-4" />}
              title={t(language, "common.show")}
              description={t(language, "settings.showInvestmentShowDesc")}
            />
            <SelectableCard
              selected={!preferences.showInvestment}
              onSelect={() => updatePreferences({ showInvestment: false })}
              icon={<EyeOff className="h-4 w-4" />}
              title={t(language, "common.hide")}
              description={t(language, "settings.showInvestmentHideDesc")}
            />
          </SelectableCardGrid>
        </CardContent>
      </Card>
    </div>
  );
}
