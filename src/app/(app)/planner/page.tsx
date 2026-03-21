"use client";

import React, { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { UpcomingTab } from "@/components/planner/upcoming-tab";
import { TagsTab } from "@/components/planner/tags-tab";
import { CostAnalysisTab } from "@/components/planner/cost-analysis-tab";
import { ReportsTab } from "@/components/planner/reports-tab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentYearMonth, getPreviousMonth, getNextMonth } from "@/lib/date";
import { useOwnership } from "@/lib/ownership-context";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

// ── Tab types ────────────────────────────────────────────────────
const TABS = ["upcoming", "tags", "cost-analysis", "reports"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  upcoming: "Upcoming",
  tags: "Tags",
  "cost-analysis": "Cost Analysis",
  reports: "Reports",
};

// ── Main Component ────────────────────────────────────────────────

export default function PlannerPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground p-8">Loading...</div>}>
      <PlannerContent />
    </Suspense>
  );
}

function PlannerContent() {
  const searchParams = useSearchParams();
  const trpc = useTRPC();
  const { visibilityParam } = useOwnership();

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const param = searchParams.get("tab");
    return TABS.includes(param as Tab) ? (param as Tab) : "upcoming";
  });

  // Sync tab to URL
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    qs.set("tab", activeTab);
    window.history.replaceState(null, "", `?${qs.toString()}`);
  }, [activeTab]);

  const [period, setPeriod] = useState(getCurrentYearMonth());

  // Month picker state
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(period.year);
  const monthPickerRef = useRef<HTMLDivElement>(null);

  // Close month picker on click outside
  useEffect(() => {
    if (!showMonthPicker) return;
    const handler = (e: MouseEvent) => {
      if (monthPickerRef.current && !monthPickerRef.current.contains(e.target as Node)) {
        setShowMonthPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMonthPicker]);

  // Visibility
  const visibility = visibilityParam ?? "SHARED";

  // Need tracker for loading state
  const trackerQuery = useQuery(
    trpc.tracker.getOrCreate.queryOptions({
      month: period.month,
      year: period.year,
      visibility,
    })
  );

  const tracker = trackerQuery.data;
  const monthName = new Date(period.year, period.month - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  // Loading state
  if (trackerQuery.isLoading || !tracker) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-[500px] w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
        {/* Left: Month nav */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPeriod(getPreviousMonth(period.year, period.month))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Month picker */}
          <div className="relative" ref={monthPickerRef}>
            <button
              onClick={() => {
                setPickerYear(period.year);
                setShowMonthPicker((v) => !v);
              }}
              className="flex items-center gap-1.5 text-sm font-semibold min-w-[130px] justify-center rounded-md px-2 py-1 hover:bg-muted transition-colors"
            >
              {monthName}
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", showMonthPicker && "rotate-180")} />
            </button>

            {showMonthPicker && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-50 rounded-lg border bg-card shadow-lg p-3 w-[260px]">
                {/* Year nav */}
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => setPickerYear((y) => y - 1)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-semibold">{pickerYear}</span>
                  <button
                    onClick={() => setPickerYear((y) => y + 1)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Month grid */}
                <div className="grid grid-cols-3 gap-1">
                  {Array.from({ length: 12 }, (_, i) => {
                    const m = i + 1;
                    const label = new Date(pickerYear, i).toLocaleString("default", { month: "short" });
                    const isSelected = pickerYear === period.year && m === period.month;
                    const { month: curMonth, year: curYear } = getCurrentYearMonth();
                    const isCurrent = pickerYear === curYear && m === curMonth;

                    return (
                      <button
                        key={m}
                        onClick={() => {
                          setPeriod({ year: pickerYear, month: m });
                          setShowMonthPicker(false);
                        }}
                        className={cn(
                          "text-xs py-1.5 px-2 rounded-md transition-colors font-medium",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : isCurrent
                              ? "bg-muted font-semibold ring-1 ring-primary/30"
                              : "hover:bg-muted text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Today shortcut */}
                <button
                  onClick={() => {
                    const { month, year } = getCurrentYearMonth();
                    setPeriod({ year, month });
                    setShowMonthPicker(false);
                  }}
                  className="mt-2 w-full text-xs text-center py-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  Go to current month
                </button>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPeriod(getNextMonth(period.year, period.month))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Badge
            variant={visibility === "SHARED" ? "shared" : "personal"}
            className="text-[10px] ml-1"
          >
            {visibility === "SHARED" ? "Shared" : "Personal"}
          </Badge>
        </div>
      </div>

      {/* ── Tab Bar ───────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* ── Upcoming Tab ───────────────────────────────────────────── */}
      {activeTab === "upcoming" && (
        <UpcomingTab month={period.month} year={period.year} visibility={visibility} />
      )}

      {/* ── Cost Analysis Tab ──────────────────────────────────────── */}
      {activeTab === "cost-analysis" && (
        <CostAnalysisTab month={period.month} year={period.year} visibility={visibility} />
      )}

      {/* ── Reports Tab ────────────────────────────────────────────── */}
      {activeTab === "reports" && (
        <ReportsTab month={period.month} year={period.year} visibility={visibility} />
      )}

      {/* ── Tags Explorer ─────────────────────────────────────────── */}
      {activeTab === "tags" && (
        <TagsTab month={period.month} year={period.year} visibility={visibility} />
      )}
    </div>
  );
}
