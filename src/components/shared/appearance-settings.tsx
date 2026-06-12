"use client";

import * as React from "react";
import { Sun, Moon, Monitor, Palette, Globe2, MapPin } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  SelectableCard,
  SelectableCardGrid,
} from "@/components/ui/selectable-card";
import { Select } from "@/components/ui/select";
import { useUserPreferences } from "@/lib/user-preferences-context";
import { formatMoney } from "@/lib/money";
import { t, type Language } from "@/lib/translations";

const LOCALE_OPTIONS = [
  { value: "nl-NL", label: "Netherlands (nl-NL)" },
  { value: "pt-BR", label: "Brazil (pt-BR)" },
  { value: "ro-RO", label: "Romania (ro-RO)" },
  { value: "en-US", label: "United States (en-US)" },
  { value: "en-GB", label: "United Kingdom (en-GB)" },
  { value: "de-DE", label: "Germany (de-DE)" },
  { value: "fr-FR", label: "France (fr-FR)" },
];

const LANGUAGE_OPTIONS: { value: Language; label: string; sub: string }[] = [
  { value: "en", label: "English", sub: "EN" },
  { value: "pt", label: "Português", sub: "PT" },
  { value: "ro", label: "Română", sub: "RO" },
  { value: "nl", label: "Nederlands", sub: "NL" },
];

type ColorMode = "light" | "dark" | "system";
type ThemePalette = "luminous" | "classic";

/**
 * AppearanceSettings — Hermes-style appearance section.
 *
 * Layout matches the screenshot:
 *   • Card "Appearance" (intro)
 *   • Card "Color Mode" — 3 selectable cards (Light / Dark / System)
 *   • Card "Theme"      — 2 swatch cards (Luminous / Classic)
 *   • Card "Language"   — 2-4 selectable cards
 *   • Card "Region & Format" — locale dropdown with money preview
 *
 * All writes go through the existing `useUserPreferences` hook, so the
 * database + next-themes sync logic is reused unchanged.
 */
export function AppearanceSettings() {
  const { preferences, updatePreferences } = useUserPreferences();
  const { setTheme } = useTheme();
  const language = preferences.language;

  function handleColorModeChange(mode: ColorMode) {
    setTheme(mode);
    updatePreferences({ theme: mode });
  }

  function handleThemePaletteChange(palette: ThemePalette) {
    updatePreferences({ colorTheme: palette });
    // No toast on the classics — too noisy for a single click
  }

  function handleLanguageChange(lang: Language) {
    updatePreferences({ language: lang });
    toast.success(t(lang, "common.saved"));
  }

  function handleLocaleChange(locale: string) {
    updatePreferences({ locale });
  }

  const currentColorMode: ColorMode =
    (preferences.theme as ColorMode) ?? "system";
  const currentPalette: ThemePalette =
    (preferences.colorTheme as ThemePalette) ?? "luminous";

  return (
    <div className="space-y-6">
      {/* ── Appearance (intro) ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
              <Palette className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>{t(language, "settings.appearance")}</CardTitle>
              <CardDescription>
                {t(language, "settings.appearanceIntro")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* ── Color Mode ── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">
              {t(language, "settings.colorMode")}
            </CardTitle>
            <CardDescription>
              {t(language, "settings.colorModeDesc")}
            </CardDescription>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted px-2 py-1 rounded">
            {t(language, `theme.${currentColorMode}` as "theme.light")}
          </span>
        </CardHeader>
        <CardContent>
          <SelectableCardGrid cols={3}>
            <SelectableCard
              selected={currentColorMode === "light"}
              onSelect={() => handleColorModeChange("light")}
              icon={<Sun className="h-4 w-4" />}
              title={t(language, "theme.light")}
              description={t(language, "appearance.brightSurfaces")}
            />
            <SelectableCard
              selected={currentColorMode === "dark"}
              onSelect={() => handleColorModeChange("dark")}
              icon={<Moon className="h-4 w-4" />}
              title={t(language, "theme.dark")}
              description={t(language, "appearance.lowGlare")}
            />
            <SelectableCard
              selected={currentColorMode === "system"}
              onSelect={() => handleColorModeChange("system")}
              icon={<Monitor className="h-4 w-4" />}
              title={t(language, "theme.system")}
              description={t(language, "appearance.system")}
            />
          </SelectableCardGrid>
        </CardContent>
      </Card>

      {/* ── Theme Palette ── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">
              {t(language, "settings.themePalette")}
            </CardTitle>
            <CardDescription>
              {t(language, "settings.themePaletteDesc")}
            </CardDescription>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted px-2 py-1 rounded">
            {currentPalette === "luminous" ? "Luminous" : "Classic"}
          </span>
        </CardHeader>
        <CardContent>
          <SelectableCardGrid cols={2}>
            {/* Luminous Ledger — current default */}
            <SelectableCard
              selected={currentPalette === "luminous"}
              onSelect={() => handleThemePaletteChange("luminous")}
              icon={
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500">
                  <span className="text-[10px] font-bold text-white">L</span>
                </div>
              }
              title="Luminous"
              description={t(language, "appearance.swatchIndigo")}
            />
            {/* Classic — neutral */}
            <SelectableCard
              selected={currentPalette === "classic"}
              onSelect={() => handleThemePaletteChange("classic")}
              icon={
                <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-foreground">
                  <span className="text-[10px] font-bold text-background">C</span>
                </div>
              }
              title="Classic"
              description={t(language, "appearance.swatchNeutral")}
            />
          </SelectableCardGrid>
        </CardContent>
      </Card>

      {/* ── Language ── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-muted-foreground" />
              {t(language, "settings.languageSection")}
            </CardTitle>
            <CardDescription>
              {t(language, "settings.languageSectionDesc")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <SelectableCardGrid cols={2}>
            {LANGUAGE_OPTIONS.map((opt) => (
              <SelectableCard
                key={opt.value}
                selected={preferences.language === opt.value}
                onSelect={() => handleLanguageChange(opt.value)}
                title={opt.label}
                badge={opt.sub}
              />
            ))}
          </SelectableCardGrid>
          <p className="mt-3 text-xs text-muted-foreground italic">
            {t(language, "settings.languageNote")}
          </p>
        </CardContent>
      </Card>

      {/* ── Region & Format ── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              {t(language, "settings.regionFormat")}
            </CardTitle>
            <CardDescription>
              {t(language, "settings.regionFormatDesc")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">
                  {t(language, "settings.locale")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(language, "settings.localeDesc")}
                </p>
              </div>
              <div className="w-64 flex-shrink-0">
                <Select
                  value={preferences.locale}
                  onChange={(e) => handleLocaleChange(e.target.value)}
                >
                  {LOCALE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {t(language, "settings.localePreview")}
              </p>
              <p className="font-mono text-sm font-medium tabular-nums">
                {formatMoney(1234567, "EUR", preferences.locale)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
