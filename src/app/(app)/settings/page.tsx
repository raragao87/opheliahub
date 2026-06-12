"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppearanceSettings } from "@/components/shared/appearance-settings";
import { ProfileTab } from "./profile-tab";
import { PreferencesTab } from "./preferences-tab";
import { useUserPreferences } from "@/lib/user-preferences-context";
import { t, type TranslationKey } from "@/lib/translations";
import { cn } from "@/lib/utils";

type SettingsTab = "profile" | "preferences" | "appearance";

const TABS: { id: SettingsTab; labelKey: TranslationKey }[] = [
  { id: "profile", labelKey: "settings.profile" },
  { id: "preferences", labelKey: "settings.preferences" },
  { id: "appearance", labelKey: "settings.appearance" },
];

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground p-8">Loading...</div>}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { preferences } = useUserPreferences();
  const language = preferences.language;

  // Tab state lives in the URL so sections are deep-linkable and survive reloads
  const tabParam = searchParams.get("tab");
  const activeTab: SettingsTab = TABS.some((tab) => tab.id === tabParam)
    ? (tabParam as SettingsTab)
    : "profile";

  function selectTab(tab: SettingsTab) {
    router.replace(tab === "profile" ? "/settings" : `/settings?tab=${tab}`, { scroll: false });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">{t(language, "settings.title")}</h1>

      {/* Tab strip */}
      <div className="border-b border-border">
        <nav className="flex gap-1" aria-label="Settings sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              )}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              {t(language, tab.labelKey)}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "profile" && <ProfileTab />}
      {activeTab === "preferences" && <PreferencesTab />}
      {activeTab === "appearance" && <AppearanceSettings />}
    </div>
  );
}
