"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────

interface MonthPickerProps {
  dateFrom: string;
  dateTo: string;
  onChange: (dateFrom: string, dateTo: string) => void;
  className?: string;
}

interface YearMonth {
  year: number;
  month: number; // 1-based
}

// ── Helpers ──────────────────────────────────────────────────────────

function now(): YearMonth {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function ymToDateFrom({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function ymToDateTo({ year, month }: YearMonth): string {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function ymEqual(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

function ymBefore(a: YearMonth, b: YearMonth): boolean {
  return a.year < b.year || (a.year === b.year && a.month < b.month);
}

function ymBetween(ym: YearMonth, start: YearMonth, end: YearMonth): boolean {
  const s = ymBefore(start, end) ? start : end;
  const e = ymBefore(start, end) ? end : start;
  return !ymBefore(ym, s) && !ymBefore(e, ym);
}

function addMonths(ym: YearMonth, n: number): YearMonth {
  const d = new Date(ym.year, ym.month - 1 + n, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function parseRange(dateFrom: string, dateTo: string): { start: YearMonth; end: YearMonth } | null {
  if (!dateFrom || !dateTo) return null;
  try {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;
    return {
      start: { year: from.getFullYear(), month: from.getMonth() + 1 },
      end: { year: to.getFullYear(), month: to.getMonth() + 1 },
    };
  } catch {
    return null;
  }
}

function formatRange(start: YearMonth, end: YearMonth): string {
  const fmt = (ym: YearMonth) =>
    new Date(ym.year, ym.month - 1).toLocaleString("default", { month: "short", year: "numeric" });
  if (ymEqual(start, end)) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

// ── Presets ──────────────────────────────────────────────────────────

interface Preset {
  label: string;
  range: () => { start: YearMonth; end: YearMonth };
}

function getPresets(): Preset[] {
  const cur = now();
  return [
    { label: "This month", range: () => ({ start: cur, end: cur }) },
    {
      label: "Last month",
      range: () => {
        const m = addMonths(cur, -1);
        return { start: m, end: m };
      },
    },
    {
      label: "Last 3 months",
      range: () => ({ start: addMonths(cur, -2), end: cur }),
    },
    {
      label: "Last 6 months",
      range: () => ({ start: addMonths(cur, -5), end: cur }),
    },
    {
      label: "This year",
      range: () => ({
        start: { year: cur.year, month: 1 },
        end: cur,
      }),
    },
    {
      label: "Last year",
      range: () => ({
        start: { year: cur.year - 1, month: 1 },
        end: { year: cur.year - 1, month: 12 },
      }),
    },
  ];
}

// ── Component ────────────────────────────────────────────────────────

export function MonthPicker({ dateFrom, dateTo, onChange, className }: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const range = parseRange(dateFrom, dateTo);

  // Selection state: picking start or end
  const [picking, setPicking] = useState<"start" | "end">("start");
  const [tempStart, setTempStart] = useState<YearMonth | null>(null);
  const [hoverMonth, setHoverMonth] = useState<YearMonth | null>(null);

  const [pickerYear, setPickerYear] = useState(() => range?.start.year ?? now().year);

  const presets = getPresets();

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setPickerYear(range?.start.year ?? now().year);
      setPicking("start");
      setTempStart(null);
      setHoverMonth(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyRange = useCallback(
    (start: YearMonth, end: YearMonth) => {
      // Ensure start <= end
      const [s, e] = ymBefore(start, end) ? [start, end] : [end, start];
      onChange(ymToDateFrom(s), ymToDateTo(e));
    },
    [onChange]
  );

  const handleMonthClick = (ym: YearMonth) => {
    if (picking === "start") {
      setTempStart(ym);
      setPicking("end");
    } else {
      // picking === "end"
      const start = tempStart ?? ym;
      applyRange(start, ym);
      setOpen(false);
    }
  };

  const handlePreset = (preset: Preset) => {
    const { start, end } = preset.range();
    applyRange(start, end);
    setOpen(false);
  };

  const handleClear = () => {
    onChange("", "");
    setOpen(false);
  };

  // Compute display label
  const label = range ? formatRange(range.start, range.end) : null;
  const hasValue = dateFrom !== "" || dateTo !== "";
  const cur = now();

  // Active filter count for badge
  const filterCount = hasValue ? 1 : 0;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-background text-sm transition-colors hover:bg-muted whitespace-nowrap",
          hasValue && "border-primary/50"
        )}
      >
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className={label ? "text-foreground" : "text-muted-foreground"}>
          {label ?? "Date range"}
        </span>
        {hasValue ? (
          <X
            className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onChange("", "");
            }}
          />
        ) : (
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        )}
        {filterCount > 0 && (
          <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {filterCount}
          </span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 rounded-lg border bg-popover shadow-lg w-[320px]">
          {/* Presets */}
          <div className="p-2 border-b border-border flex flex-wrap gap-1">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => handlePreset(p)}
                className="text-xs px-2 py-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Instruction */}
          <div className="px-3 pt-2 pb-1">
            <p className="text-xs text-muted-foreground">
              {picking === "start"
                ? "Select start month"
                : "Select end month (or click start to pick single month)"}
            </p>
          </div>

          {/* Year nav */}
          <div className="flex items-center justify-between px-3 py-1">
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
          <div className="grid grid-cols-3 gap-1 px-3 pb-2">
            {Array.from({ length: 12 }, (_, i) => {
              const m = i + 1;
              const ym: YearMonth = { year: pickerYear, month: m };
              const monthLabel = new Date(pickerYear, i).toLocaleString("default", {
                month: "short",
              });

              // Highlight logic
              const isCurrent = pickerYear === cur.year && m === cur.month;
              const isRangeStart =
                range && ymEqual(ym, range.start);
              const isRangeEnd =
                range && ymEqual(ym, range.end);
              const isInRange =
                range && ymBetween(ym, range.start, range.end);
              const isTempStart = tempStart && ymEqual(ym, tempStart);

              // Hover preview range
              const isInHoverRange =
                picking === "end" &&
                tempStart &&
                hoverMonth &&
                ymBetween(ym, tempStart, hoverMonth);
              const isHoverEnd =
                picking === "end" && hoverMonth && ymEqual(ym, hoverMonth);

              const isEndpoint = isRangeStart || isRangeEnd || isTempStart;
              const isMiddle =
                (isInRange && !isEndpoint) ||
                (isInHoverRange && !isTempStart && !isHoverEnd);

              return (
                <button
                  key={m}
                  onClick={() => handleMonthClick(ym)}
                  onMouseEnter={() => setHoverMonth(ym)}
                  onMouseLeave={() => setHoverMonth(null)}
                  className={cn(
                    "text-xs py-1.5 px-2 rounded-md transition-colors font-medium",
                    isEndpoint || isTempStart
                      ? "bg-primary text-primary-foreground"
                      : isMiddle
                        ? "bg-primary/15 text-foreground"
                        : isHoverEnd
                          ? "bg-primary/30 text-foreground"
                          : isCurrent
                            ? "bg-muted font-semibold ring-1 ring-primary/30"
                            : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {monthLabel}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          {hasValue && (
            <div className="border-t border-border p-1.5">
              <button
                onClick={handleClear}
                className="w-full text-xs text-center py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear dates
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
