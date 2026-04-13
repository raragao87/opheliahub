"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DangerZone } from "@/components/shared/danger-zone";
import { useUserPreferences } from "@/lib/user-preferences-context";
import { formatMoney } from "@/lib/money";
import { t, type Language } from "@/lib/translations";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "next-auth/react";

const LOCALE_OPTIONS = [
  { value: "nl-NL", label: "Netherlands (nl-NL)" },
  { value: "pt-BR", label: "Brazil (pt-BR)" },
  { value: "ro-RO", label: "Romania (ro-RO)" },
  { value: "en-US", label: "United States (en-US)" },
  { value: "en-GB", label: "United Kingdom (en-GB)" },
  { value: "de-DE", label: "Germany (de-DE)" },
  { value: "fr-FR", label: "France (fr-FR)" },
];

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "pt", label: "Português" },
  { value: "ro", label: "Română" },
  { value: "nl", label: "Nederlands" },
];

export default function SettingsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { preferences, updatePreferences } = useUserPreferences();
  const { setTheme } = useTheme();

  const { data, isLoading } = useQuery(trpc.auth.getPreferences.queryOptions());

  const mutation = useMutation(
    trpc.auth.updateProfile.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(trpc.auth.getPreferences.queryOptions());
      },
      onError: (err) => {
        toast.error(err.message);
      },
    })
  );

  // Name editing
  const [nameValue, setNameValue] = useState("");
  const [nameSaving, setNameSaving] = useState(false);

  useEffect(() => {
    if (data?.name != null) {
      setNameValue(data.name);
    }
  }, [data?.name]);

  const language = preferences.language;

  async function handleSaveName() {
    if (nameValue === data?.name) return;
    setNameSaving(true);
    try {
      await mutation.mutateAsync({ name: nameValue });
      toast.success(t(language, "common.saved"));
    } finally {
      setNameSaving(false);
    }
  }

  function handleLocaleChange(locale: string) {
    updatePreferences({ locale });
  }

  function handleLanguageChange(lang: Language) {
    updatePreferences({ language: lang });
  }


  function handleThemeChange(theme: "light" | "dark" | "system") {
    setTheme(theme);
    updatePreferences({ theme });
  }

  function handleColorThemeChange(colorTheme: "classic" | "luminous") {
    updatePreferences({ colorTheme });
  }

  function handleBudgetMonthsChange(linked: boolean) {
    updatePreferences({ budgetMonthsLinked: linked });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedLocale = preferences.locale;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">{t(language, "settings.title")}</h1>

      {/* Two-column layout on md+ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Profile Section */}
        <Card>
          <CardHeader>
            <CardTitle>{t(language, "settings.profile")}</CardTitle>
            <CardDescription>{t(language, "settings.profileDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              {data?.image ? (
                <img
                  src={data.image}
                  alt={data.name ?? ""}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-xl font-semibold text-muted-foreground">
                  {data?.name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t(language, "settings.avatarNote")}</p>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="displayName">{t(language, "settings.editName")}</Label>
              <div className="flex gap-2">
                <Input
                  id="displayName"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  placeholder="Your name"
                  className="flex-1"
                />
                {nameValue !== (data?.name ?? "") && (
                  <Button
                    onClick={handleSaveName}
                    disabled={nameSaving}
                    size="sm"
                  >
                    {nameSaving ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                        {t(language, "common.saving")}
                      </>
                    ) : (
                      t(language, "common.save")
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email">{t(language, "settings.emailReadOnly")}</Label>
              <Input
                id="email"
                value={data?.email ?? ""}
                readOnly
                disabled
                className="bg-muted text-muted-foreground"
              />
            </div>

            {/* Sign Out */}
            <Button
              variant="outline"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              {t(language, "nav.signOut")}
            </Button>
          </CardContent>
        </Card>

        {/* Preferences Section */}
        <Card>
          <CardHeader>
            <CardTitle>{t(language, "settings.preferences")}</CardTitle>
            <CardDescription>{t(language, "settings.preferencesDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Region & Format */}
            <div className="space-y-2">
              <Label htmlFor="locale">{t(language, "settings.locale")}</Label>
              <p className="text-xs text-muted-foreground">{t(language, "settings.localeDesc")}</p>
              <Select
                id="locale"
                value={selectedLocale}
                onChange={(e) => handleLocaleChange(e.target.value)}
              >
                {LOCALE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                {t(language, "settings.localePreview")}:{" "}
                <span className="font-mono font-medium">
                  {formatMoney(123456, "EUR", selectedLocale)}
                </span>
              </p>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label htmlFor="language">{t(language, "settings.language")}</Label>
              <p className="text-xs text-muted-foreground">{t(language, "settings.languageDesc")}</p>
              <Select
                id="language"
                value={preferences.language}
                onChange={(e) => handleLanguageChange(e.target.value as Language)}
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground italic">
                {t(language, "settings.languageNote")}
              </p>
            </div>


            {/* Theme */}
            <div className="space-y-2">
              <Label>{t(language, "settings.theme")}</Label>
              <p className="text-xs text-muted-foreground">{t(language, "settings.themeDesc")}</p>
              <div className="flex gap-2">
                {(["light", "dark", "system"] as const).map((themeOption) => (
                  <Button
                    key={themeOption}
                    variant="outline"
                    size="sm"
                    className={cn(
                      preferences.theme === themeOption &&
                        "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground border-primary"
                    )}
                    onClick={() => handleThemeChange(themeOption)}
                  >
                    {t(language, `theme.${themeOption}` as "theme.light" | "theme.dark" | "theme.system")}
                  </Button>
                ))}
              </div>
            </div>

            {/* Color Theme */}
            <div className="space-y-2">
              <Label>{t(language, "settings.colorTheme" as any)}</Label>
              <p className="text-xs text-muted-foreground">{t(language, "settings.colorThemeDesc" as any)}</p>
              <div className="flex gap-2">
                {(["classic", "luminous"] as const).map((ct) => (
                  <Button
                    key={ct}
                    variant="outline"
                    size="sm"
                    className={cn(
                      preferences.colorTheme === ct &&
                        "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground border-primary"
                    )}
                    onClick={() => handleColorThemeChange(ct)}
                  >
                    {t(language, `colorTheme.${ct}` as any)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Budget Months */}
            <div className="space-y-2">
              <Label>{t(language, "settings.budgetMonths" as any)}</Label>
              <p className="text-xs text-muted-foreground">{t(language, "settings.budgetMonthsDesc" as any)}</p>
              <div className="flex gap-2">
                {([false, true] as const).map((linked) => (
                  <Button
                    key={String(linked)}
                    variant="outline"
                    size="sm"
                    className={cn(
                      preferences.budgetMonthsLinked === linked &&
                        "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground border-primary"
                    )}
                    onClick={() => handleBudgetMonthsChange(linked)}
                  >
                    {t(language, linked ? "budgetMonths.linked" as any : "budgetMonths.independent" as any)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Show Investment */}
            <div className="space-y-2">
              <Label>{t(language, "settings.showInvestment" as any)}</Label>
              <p className="text-xs text-muted-foreground">{t(language, "settings.showInvestmentDesc" as any)}</p>
              <div className="flex gap-2">
                {([true, false] as const).map((show) => (
                  <Button
                    key={String(show)}
                    variant="outline"
                    size="sm"
                    className={cn(
                      preferences.showInvestment === show &&
                        "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground border-primary"
                    )}
                    onClick={() => updatePreferences({ showInvestment: show })}
                  >
                    {t(language, show ? "common.show" as any : "common.hide" as any)}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Danger Zone — full width */}
      <DangerZone userEmail={data?.email ?? ""} />
    </div>
  );
}
