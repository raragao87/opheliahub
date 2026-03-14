"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "opheliahub_onboarding_dismissed";

interface ChecklistItem {
  id: string;
  label: string;
  href: string;
  condition?: boolean; // show only if condition is true (undefined = always show)
}

export function GettingStartedChecklist() {
  const trpc = useTRPC();
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  const householdQuery = useQuery(trpc.household.get.queryOptions());
  const accountsQuery = useQuery(
    trpc.dashboard.accountBalances.queryOptions({})
  );

  const household = householdQuery.data;
  const accounts = accountsQuery.data ?? [];
  const memberCount = household?.members.length ?? 0;
  const hasAccounts = accounts.length > 0;
  const hasSoloHousehold = memberCount === 1;

  if (dismissed) return null;

  const items: ChecklistItem[] = [
    {
      id: "account",
      label: "Create your first account",
      href: "/accounts/new",
    },
    {
      id: "import",
      label: "Import your first bank statement",
      href: "/transactions/import",
    },
    {
      id: "categories",
      label: "Set up your budget categories",
      href: "/settings",
    },
    {
      id: "invite",
      label: "Invite your partner",
      href: "/household",
      condition: hasSoloHousehold,
    },
  ];

  const visibleItems = items.filter(
    (item) => item.condition === undefined || item.condition
  );

  // All conditions met → nothing left to do, auto-dismiss
  const completedIds = new Set<string>();
  if (hasAccounts) completedIds.add("account");

  const allDone = visibleItems.every((item) => completedIds.has(item.id));
  if (allDone) return null;

  return (
    <Card className="mb-6 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
      <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Getting started</CardTitle>
          <p className="text-sm text-muted-foreground mt-0.5">
            A few quick steps to get the most out of OpheliaHub.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground -mt-1 -mr-1"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "true");
            setDismissed(true);
          }}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {visibleItems.map((item) => {
          const done = completedIds.has(item.id);
          return (
            <Link
              key={item.id}
              href={done ? "#" : item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors group",
                done
                  ? "text-muted-foreground cursor-default"
                  : "hover:bg-primary/10 text-foreground"
              )}
            >
              <div
                className={cn(
                  "h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                  done
                    ? "border-green-500 bg-green-500"
                    : "border-muted-foreground/40 group-hover:border-primary"
                )}
              >
                {done && <Check className="h-3 w-3 text-white" />}
              </div>
              <span className={cn(done && "line-through")}>{item.label}</span>
              {!done && (
                <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-primary transition-colors" />
              )}
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
