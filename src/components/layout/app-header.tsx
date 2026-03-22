"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, Users, User, Home, Settings, LogOut, ChevronDown, MessageSquarePlus } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useOwnership } from "@/lib/ownership-context";
import { navSections } from "@/lib/nav-config";
import { SidebarAccounts } from "./sidebar-accounts";
import { FeedbackDialog } from "@/components/shared/feedback-dialog";
import { QuickCalculator } from "@/components/shared/quick-calculator";
import { OpheliaChat } from "@/components/ophelia/ophelia-chat";
import { QuickNotes } from "@/components/shared/quick-notes";
import { useUserPreferences } from "@/lib/user-preferences-context";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { t } from "@/lib/translations";

// Map nav item href → translation key
const NAV_ITEM_KEYS: Record<string, "nav.dashboard" | "nav.tracker" | "nav.planner"> = {
  "/dashboard": "nav.dashboard",
  "/tracker": "nav.tracker",
  "/planner": "nav.planner",
};

interface AppHeaderProps {
  userName?: string | null;
  userImage?: string | null;
  userEmail?: string | null;
}

export function AppHeader({ userName, userImage, userEmail }: AppHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { visibility, setVisibility } = useOwnership();
  const trpc = useTRPC();
  const { preferences } = useUserPreferences();
  const lang = preferences.language;

  // Use live DB data so display name changes in Settings reflect immediately
  const prefsQuery = useQuery(trpc.auth.getPreferences.queryOptions());
  const displayName = prefsQuery.data?.name ?? userName;
  const displayImage = prefsQuery.data?.image ?? userImage;
  const displayEmail = prefsQuery.data?.email ?? userEmail;

  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center gap-4 glass px-4 md:px-6">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>

        {/* Mobile logo */}
        <Link href="/dashboard" className="md:hidden flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">OH</span>
          </div>
        </Link>

        <div className="flex-1" />

        {/* Ophelia chat + Quick calculator */}
        <OpheliaChat />
        <QuickNotes />
        <QuickCalculator />

        {/* User menu dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent transition-colors outline-none"
            >
              {displayImage ? (
                <img
                  src={displayImage}
                  alt={displayName ?? "User"}
                  className="h-7 w-7 rounded-full shrink-0"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <span className="text-primary-foreground font-semibold text-xs">
                    {displayName?.charAt(0)?.toUpperCase() ?? "U"}
                  </span>
                </div>
              )}
              <span className="text-sm font-medium hidden sm:block">{displayName ?? "User"}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            {/* User identity */}
            <div className="flex items-center gap-2 px-2 py-2">
              {displayImage ? (
                <img
                  src={displayImage}
                  alt={displayName ?? "User"}
                  className="h-8 w-8 rounded-full shrink-0"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <span className="text-primary-foreground font-semibold text-xs">
                    {displayName?.charAt(0)?.toUpperCase() ?? "U"}
                  </span>
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate">{displayName ?? "User"}</span>
                {displayEmail && (
                  <span className="text-xs text-muted-foreground truncate">{displayEmail}</span>
                )}
              </div>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => router.push("/household")}>
              <Home className="h-4 w-4" />
              {t(lang, "nav.household")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="h-4 w-4" />
              {t(lang, "nav.settings")}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => setFeedbackOpen(true)}>
              <MessageSquarePlus className="h-4 w-4" />
              {t(lang, "nav.giveFeedback")}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
            >
              <LogOut className="h-4 w-4" />
              {t(lang, "nav.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      </header>

      {/* Mobile navigation overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-64 bg-surface-container-low shadow-ambient flex flex-col overflow-hidden">
            {/* Logo */}
            <div className="flex items-center h-16 px-4 flex-shrink-0">
              <Link
                href="/dashboard"
                className="flex items-center gap-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-sm">OH</span>
                </div>
                <span className="text-lg font-semibold">OpheliaHub</span>
              </Link>
            </div>

            {/* Ownership filter */}
            <div className="px-3 pt-4 pb-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-1 mb-2">
                {t(lang, "sidebar.showing")}
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setVisibility("SHARED")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md border transition-colors",
                    visibility === "SHARED"
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-transparent text-muted-foreground border-transparent hover:bg-muted"
                  )}
                >
                  <Users className="h-3.5 w-3.5" />
                  {t(lang, "common.shared")}
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility("PERSONAL")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md border transition-colors",
                    visibility === "PERSONAL"
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-transparent text-muted-foreground border-transparent hover:bg-muted"
                  )}
                >
                  <User className="h-3.5 w-3.5" />
                  {t(lang, "common.personal")}
                </button>
              </div>
            </div>

            {/* Grouped navigation sections */}
            <nav className="flex-1 overflow-y-auto min-h-0 px-2 py-2">
              {navSections.map((section) => (
                <div key={section.label} className="mb-4">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1">
                    {t(lang, "nav.sectionMain")}
                  </p>
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const nameKey = NAV_ITEM_KEYS[item.href];
                      const name = nameKey ? t(lang, nameKey) : item.name;
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={cn(
                            "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                            isActive(item.href)
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          <item.icon className="h-5 w-5 flex-shrink-0" />
                          {name}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Dynamic accounts section */}
              <Suspense
                fallback={
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {t(lang, "common.loading")}
                  </div>
                }
              >
                <SidebarAccounts onNavigate={() => setMobileMenuOpen(false)} />
              </Suspense>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
