"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOwnership } from "@/lib/ownership-context";
import { navSections, bottomNavItems } from "@/lib/nav-config";
import { SidebarAccounts } from "./sidebar-accounts";

export function AppSidebar() {
  const pathname = usePathname();
  const { visibility, setVisibility } = useOwnership();

  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
      <div className="flex flex-col flex-grow border-r bg-card">
        {/* Logo */}
        <div className="flex items-center h-16 flex-shrink-0 px-4 border-b">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">OH</span>
            </div>
            <span className="text-lg font-semibold">OpheliaHub</span>
          </Link>
        </div>

        {/* Ownership filter */}
        <div className="px-3 pt-4 pb-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-1 mb-2">
            Showing
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
              Shared
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
              Personal
            </button>
          </div>
        </div>

        {/* Main navigation — grouped sections */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {navSections.map((section) => (
            <div key={section.label} className="mb-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive(item.href)
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}

          {/* Dynamic accounts section */}
          <Suspense fallback={<AccountsLoadingSkeleton />}>
            <SidebarAccounts />
          </Suspense>
        </nav>

        {/* Bottom-anchored items */}
        <div className="border-t px-2 py-2 space-y-0.5">
          {bottomNavItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {item.name}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}

function AccountsLoadingSkeleton() {
  return (
    <div className="mt-2 px-3 space-y-2">
      <div className="h-3 w-16 bg-muted rounded animate-pulse" />
      <div className="h-6 bg-muted rounded animate-pulse" />
      <div className="h-4 bg-muted rounded animate-pulse" />
      <div className="h-4 bg-muted rounded animate-pulse" />
      <div className="h-4 bg-muted rounded animate-pulse" />
    </div>
  );
}
