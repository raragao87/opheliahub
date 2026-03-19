"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  ArrowLeftRight, Trash2, X,
  ChevronDown, ChevronLeft, ChevronRight,
  CircleSlash, Search, MessageSquare, Sparkles,
} from "lucide-react";
import { InlineMoneyEdit } from "@/components/shared/inline-money-edit";
import { InlineTextEdit } from "@/components/shared/inline-text-edit";
import { InlineDateEdit } from "@/components/shared/inline-date-edit";
import { InlineSelectEdit } from "@/components/shared/inline-select-edit";
import { InlineTagEdit } from "@/components/shared/inline-tag-edit";
import { ACCOUNT_TYPE_META } from "@/lib/account-types";
import { cn } from "@/lib/utils";
import type { FilterOptionGroup } from "@/components/shared/multi-select-filter";

// ── Types ────────────────────────────────────────────────────────────

interface TransactionAccount {
  id: string;
  name: string;
  type?: string;
}

interface TransactionCategory {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
}

interface TransactionTag {
  tag: { id: string; name: string; color?: string | null };
}

interface TransactionLinked {
  account: { id: string; name: string };
}

export interface TransactionItem {
  id: string;
  amount: number;
  type: string;
  description: string;
  displayName?: string | null;
  date: Date | string;
  accrualDate?: Date | string | null;
  isInitialBalance?: boolean;
  visibility: string;
  account: TransactionAccount;
  category?: TransactionCategory | null;
  fund?: { id: string; name: string; icon?: string | null } | null;
  tags: TransactionTag[];
  linkedTransaction?: TransactionLinked | null;
  linkedBy?: TransactionLinked | null;
  importBatchId?: string | null;
  notes?: string | null;
  // Ophelia AI fields
  opheliaProcessedAt?: Date | string | null;
  opheliaCategoryId?: string | null;
  opheliaCategory?: { id: string; name: string } | null;
  opheliaConfidence?: number | null;
  opheliaDisplayName?: string | null;
}

interface CategoryOption {
  id: string;
  name: string;
  icon?: string | null;
  groupName: string;
}

interface TagOption {
  id: string;
  name: string;
  color?: string | null;
  group?: { id: string; name: string } | null;
}

export interface ColumnFilters {
  search: string;
  dateFrom: string;
  dateTo: string;
  accountIds: string[];
  categoryIds: string[];
  tagIds: string[];
  uncategorized: boolean;
  noTags: boolean;
  amountMin: string;
  amountMax: string;
  type: string;
  transferType: string;
}

interface FundOption {
  id: string;
  name: string;
  icon?: string | null;
}

interface TransactionTableProps {
  transactions: TransactionItem[];
  flatCategories: CategoryOption[];
  funds?: FundOption[];
  allTags: TagOption[];
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  updatingId?: string;
  // Selection props
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  // Column filter props
  columnFilters?: ColumnFilters;
  onColumnFilterChange?: (key: keyof ColumnFilters, value: ColumnFilters[keyof ColumnFilters]) => void;
  onTypeChange?: (type: string, transferType: string) => void;
  onDelete?: (id: string) => void;
  onMarkAsTransfer?: (txn: TransactionItem) => void;
  onUnmarkTransfer?: (txn: TransactionItem) => void;
  accountFilterGroups?: FilterOptionGroup[];
  categoryFilterGroups?: FilterOptionGroup[];
  tagFilterGroups?: FilterOptionGroup[];
  /** Pixels from top for the sticky thead (default 64 = app header height) */
  stickyOffset?: number;
}

// ── Column Header Filter ─────────────────────────────────────────────

interface ColumnHeaderFilterProps {
  label: string;
  active: boolean;
  children: (close: () => void) => React.ReactNode;
  /** If true, render the trigger as icon-only with no text */
  iconOnly?: React.ReactNode;
}

function ColumnHeaderFilter({ label, active, children, iconOnly }: ColumnHeaderFilterProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const toggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen((v) => !v);
  };

  // Reposition if dropdown overflows viewport
  useEffect(() => {
    if (!open || !dropdownRef.current) return;
    const el = dropdownRef.current;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      setPos((p) => ({ ...p, left: Math.max(8, window.innerWidth - rect.width - 8) }));
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (iconOnly) {
    return (
      <>
        <button
          ref={triggerRef}
          onClick={toggle}
          title={label}
          className={cn(
            "flex items-center justify-center w-full transition-colors",
            active ? "text-primary" : "text-muted-foreground/60 hover:text-muted-foreground"
          )}
        >
          {iconOnly}
          {active && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
        </button>
        {open && (
          <div
            ref={dropdownRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
            className="rounded-lg border bg-popover shadow-lg w-[180px]"
          >
            {children(close)}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={toggle}
        className={cn(
          "flex items-center gap-1 group/fh w-full text-left font-medium text-xs transition-colors",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <span>{label}</span>
        <ChevronDown className={cn(
          "h-3 w-3 shrink-0 transition-transform",
          open && "rotate-180",
          active ? "text-primary" : "text-muted-foreground/60 group-hover/fh:text-muted-foreground"
        )} />
        {active && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
      </button>
      {open && (
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="rounded-lg border bg-popover shadow-lg min-w-[260px] max-h-[400px] flex flex-col"
        >
          {children(close)}
        </div>
      )}
    </>
  );
}

// ── Column Search Input ───────────────────────────────────────────────

function ColumnSearchInput({
  search, onChange, close,
}: { search: string; onChange: (s: string) => void; close: () => void }) {
  const [draft, setDraft] = useState(search);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Sync from parent only when the input is NOT focused (e.g. external "Clear all")
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(search);
    }
  }, [search]);

  return (
    <div className="p-2 space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search by name…"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") close();
            if (e.key === "Escape") close();
          }}
          className="w-full h-8 rounded-md border border-input bg-background pl-7 pr-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {draft && (
        <button
          onClick={() => { setDraft(""); onChange(""); close(); }}
          className="w-full text-xs text-center py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ── Column Multiselect Filter ─────────────────────────────────────────

interface ColumnMultiSelectProps {
  groups: FilterOptionGroup[];
  selected: string[];
  onChange: (ids: string[]) => void;
  toggleLabel?: string;
  toggleActive?: boolean;
  onToggle?: () => void;
  /** Extra toggles rendered before groups (e.g. "Transfer") */
  extraToggles?: Array<{ label: string; active: boolean; onToggle: () => void; icon?: React.ReactNode }>;
  close: () => void;
}

function ColumnMultiSelect({
  groups, selected, onChange,
  toggleLabel, toggleActive, onToggle,
  extraToggles,
  close,
}: ColumnMultiSelectProps) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const total = groups.reduce((s, g) => s + g.options.length, 0);

  const filtered = search
    ? groups.map((g) => ({
        ...g,
        options: g.options.filter((o) =>
          o.label.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter((g) => g.options.length > 0)
    : groups;

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);

  const toggleGroup = (group: FilterOptionGroup) => {
    const groupIds = group.options.map((o) => o.value);
    const allSelected = groupIds.every((id) => selected.includes(id));
    if (allSelected) {
      onChange(selected.filter((id) => !groupIds.includes(id)));
    } else {
      onChange([...new Set([...selected, ...groupIds])]);
    }
  };

  const hasAnyActive = selected.length > 0 || toggleActive || extraToggles?.some((t) => t.active);

  return (
    <>
      {total > 8 && (
        <div className="p-2 border-b border-border shrink-0">
          <input
            ref={searchRef}
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      )}
      <div className="overflow-y-auto p-1.5 flex-1 space-y-0.5">
        {toggleLabel && onToggle && (
          <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm">
            <CircleSlash className={cn("h-3.5 w-3.5 shrink-0", toggleActive ? "text-primary" : "text-muted-foreground")} />
            <span className={toggleActive ? "text-foreground font-medium" : "text-muted-foreground"}>
              {toggleLabel}
            </span>
            <input type="checkbox" checked={toggleActive ?? false} onChange={onToggle} className="ml-auto rounded border-border" />
          </label>
        )}
        {extraToggles?.map((et, i) => (
          <label key={i} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm">
            {et.icon ?? <ArrowLeftRight className={cn("h-3.5 w-3.5 shrink-0", et.active ? "text-primary" : "text-muted-foreground")} />}
            <span className={et.active ? "text-foreground font-medium" : "text-muted-foreground"}>
              {et.label}
            </span>
            <input type="checkbox" checked={et.active} onChange={et.onToggle} className="ml-auto rounded border-border" />
          </label>
        ))}
        {filtered.map((group, gi) => {
          const showHeaders = groups.length > 1;
          return (
            <div key={gi} className={gi > 0 && showHeaders ? "mt-1 pt-1 border-t border-border/40" : ""}>
              {showHeaders && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider px-2 py-1 hover:text-foreground transition-colors cursor-pointer w-full text-left flex items-center gap-1.5"
                >
                  <input
                    type="checkbox"
                    checked={group.options.length > 0 && group.options.every((o) => selected.includes(o.value))}
                    ref={(el) => {
                      if (el) {
                        const count = group.options.filter((o) => selected.includes(o.value)).length;
                        el.indeterminate = count > 0 && count < group.options.length;
                      }
                    }}
                    onChange={() => toggleGroup(group)}
                    className="rounded border-border shrink-0 h-3 w-3"
                  />
                  {group.label}
                </button>
              )}
              {group.options.map((opt) => (
                <label key={opt.value} className={cn(
                  "flex items-center gap-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm",
                  showHeaders ? "pl-5 pr-2" : "px-2"
                )}>
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={() => toggle(opt.value)}
                    className="rounded border-border shrink-0"
                  />
                  {opt.icon && <span className="text-xs shrink-0">{opt.icon}</span>}
                  <span className="truncate">{opt.label}</span>
                </label>
              ))}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground/50 text-center py-3">No matches</p>
        )}
      </div>
      {hasAnyActive && (
        <div className="border-t border-border p-1.5 shrink-0">
          <button
            onClick={() => {
              onChange([]);
              if (toggleActive && onToggle) onToggle();
              extraToggles?.forEach((et) => { if (et.active) et.onToggle(); });
              close();
            }}
            className="w-full text-xs text-center py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      )}
    </>
  );
}

// ── Column Month Picker ───────────────────────────────────────────────

interface YM { year: number; month: number }

function ymEqual(a: YM, b: YM) { return a.year === b.year && a.month === b.month; }
function ymBefore(a: YM, b: YM) { return a.year < b.year || (a.year === b.year && a.month < b.month); }
function ymBetween(ym: YM, s: YM, e: YM) {
  const [lo, hi] = ymBefore(s, e) ? [s, e] : [e, s];
  return !ymBefore(ym, lo) && !ymBefore(hi, ym);
}
function addMonths(ym: YM, n: number): YM {
  const d = new Date(ym.year, ym.month - 1 + n, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
function parseDateToYM(s: string): YM | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
function ymToDateFrom(ym: YM) { return `${ym.year}-${String(ym.month).padStart(2, "0")}-01`; }
function ymToDateTo(ym: YM) {
  const last = new Date(ym.year, ym.month, 0).getDate();
  return `${ym.year}-${String(ym.month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

const MONTH_PRESETS = [
  { label: "All",        get: () => null },
  { label: "This month", get: () => { const n = nowYM(); return [n, n] as [YM, YM]; } },
  { label: "Last month", get: () => { const m = addMonths(nowYM(), -1); return [m, m] as [YM, YM]; } },
  { label: "Last 3 mo",  get: () => [addMonths(nowYM(), -2), nowYM()] as [YM, YM] },
  { label: "Last 6 mo",  get: () => [addMonths(nowYM(), -5), nowYM()] as [YM, YM] },
  { label: "This year",  get: () => [{ year: nowYM().year, month: 1 }, nowYM()] as [YM, YM] },
];
function nowYM(): YM { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1 }; }

function ColumnMonthPicker({
  dateFrom, dateTo, onChange, close,
}: {
  dateFrom: string; dateTo: string;
  onChange: (from: string, to: string) => void;
  close: () => void;
}) {
  const [year, setYear] = useState(() => parseDateToYM(dateFrom)?.year ?? nowYM().year);
  const [editingYear, setEditingYear] = useState(false);
  const [yearDraft, setYearDraft] = useState("");
  const [picking, setPicking] = useState<"start" | "end">("start");
  const [tempStart, setTempStart] = useState<YM | null>(null);
  const [hover, setHover] = useState<YM | null>(null);

  const rangeStart = parseDateToYM(dateFrom);
  const rangeEnd   = parseDateToYM(dateTo);
  const cur = nowYM();

  const apply = (s: YM, e: YM) => {
    const [lo, hi] = ymBefore(s, e) ? [s, e] : [e, s];
    onChange(ymToDateFrom(lo), ymToDateTo(hi));
  };

  const handleClick = (ym: YM) => {
    if (picking === "start") {
      setTempStart(ym);
      setPicking("end");
    } else {
      apply(tempStart ?? ym, ym);
      close();
    }
  };

  const hint = picking === "start" ? "Select start" : "Select end";

  return (
    <div className="w-[280px]">
      {/* Presets — 3×2 grid */}
      <div className="p-2 border-b border-border grid grid-cols-3 gap-1">
        {MONTH_PRESETS.map((p) => (
          <button key={p.label} onClick={() => { const r = p.get(); if (r) { apply(r[0], r[1]); } else { onChange("", ""); } close(); }}
            className="text-xs px-1 py-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors font-medium text-center whitespace-nowrap">
            {p.label}
          </button>
        ))}
      </div>
      {/* Year nav + hint */}
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{hint}</span>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setYear((y) => y - 1)}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          {editingYear ? (
            <input
              type="number"
              value={yearDraft}
              onChange={(e) => setYearDraft(e.target.value)}
              onBlur={() => {
                const parsed = parseInt(yearDraft, 10);
                if (!isNaN(parsed) && parsed >= 1900 && parsed <= 2100) setYear(parsed);
                setEditingYear(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditingYear(false);
              }}
              className="w-12 text-xs font-semibold text-center bg-transparent border-b border-primary/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              autoFocus
            />
          ) : (
            <button
              onClick={() => { setYearDraft(String(year)); setEditingYear(true); }}
              className="text-xs font-semibold w-9 text-center hover:text-primary transition-colors cursor-pointer"
              title="Click to edit year"
            >
              {year}
            </button>
          )}
          <button onClick={() => setYear((y) => y + 1)}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {/* Month grid */}
      <div className="grid grid-cols-4 gap-1 px-2 pb-2">
        {Array.from({ length: 12 }, (_, i) => {
          const ym: YM = { year, month: i + 1 };
          const label = new Date(year, i).toLocaleString("default", { month: "short" });
          const isEndpoint = (rangeStart && ymEqual(ym, rangeStart)) || (rangeEnd && ymEqual(ym, rangeEnd)) || (tempStart && ymEqual(ym, tempStart));
          const isInRange  = rangeStart && rangeEnd && ymBetween(ym, rangeStart, rangeEnd);
          const isHover    = picking === "end" && tempStart && hover && ymBetween(ym, tempStart, hover);
          const isCur      = ymEqual(ym, cur);
          return (
            <button key={i} onClick={() => handleClick(ym)}
              onMouseEnter={() => setHover(ym)}
              onMouseLeave={() => setHover(null)}
              className={cn(
                "text-xs py-1.5 rounded-md transition-colors font-medium",
                isEndpoint ? "bg-primary text-primary-foreground"
                  : isInRange || isHover ? "bg-primary/15 text-foreground"
                    : isCur ? "bg-muted ring-1 ring-primary/30"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
              )}>
              {label}
            </button>
          );
        })}
      </div>
      {(dateFrom || dateTo) && (
        <div className="border-t border-border p-1.5">
          <button onClick={() => { onChange("", ""); close(); }}
            className="w-full text-xs text-center py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

// ── Column Amount Range Filter ────────────────────────────────────────

function ColumnAmountRange({
  amountMin, amountMax,
  dataMin, dataMax,
  onChange, close,
}: {
  amountMin: string; amountMax: string;
  /** Absolute bounds from actual transaction data (display values, not cents) */
  dataMin: number; dataMax: number;
  onChange: (min: string, max: string) => void;
  close: () => void;
}) {
  const [min, setMin] = useState(amountMin);
  const [max, setMax] = useState(amountMax);

  const sliderMin = dataMin;
  const sliderMax = dataMax;
  const range = sliderMax - sliderMin;
  const step = range <= 100 ? 1 : range <= 1000 ? 5 : range <= 10000 ? 50 : 100;

  const curMin = min ? parseFloat(min) : sliderMin;
  const curMax = max ? parseFloat(max) : sliderMax;

  const apply = () => { onChange(min, max); close(); };
  const clear = () => { onChange("", ""); close(); };

  return (
    <div className="p-3 space-y-3 w-[280px]">
      {/* Dual range slider */}
      <div className="relative h-6 flex items-center">
        {/* Track background */}
        <div className="absolute inset-x-0 h-1 rounded-full bg-muted" />
        {/* Active range */}
        <div
          className="absolute h-1 rounded-full bg-primary"
          style={{
            left: `${((curMin - sliderMin) / (sliderMax - sliderMin)) * 100}%`,
            right: `${100 - ((curMax - sliderMin) / (sliderMax - sliderMin)) * 100}%`,
          }}
        />
        {/* Min thumb */}
        <input
          type="range"
          min={sliderMin} max={sliderMax} step={step}
          value={curMin}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (v <= curMax) setMin(v <= sliderMin ? "" : v.toString());
          }}
          className="absolute inset-x-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:cursor-pointer"
        />
        {/* Max thumb */}
        <input
          type="range"
          min={sliderMin} max={sliderMax} step={step}
          value={curMax}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (v >= curMin) setMax(v >= sliderMax ? "" : v.toString());
          }}
          className="absolute inset-x-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:cursor-pointer"
        />
      </div>

      {/* Inline editable min/max inputs */}
      <div className="flex items-center gap-2">
        <div className="flex-1 space-y-0.5">
          <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Min</label>
          <input
            type="number" step="0.01" value={min} placeholder={sliderMin.toFixed(0)}
            onChange={(e) => setMin(e.target.value)}
            onBlur={apply}
            onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
            className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <span className="text-muted-foreground/40 pt-3">—</span>
        <div className="flex-1 space-y-0.5">
          <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Max</label>
          <input
            type="number" step="0.01" value={max} placeholder={sliderMax.toFixed(0)}
            onChange={(e) => setMax(e.target.value)}
            onBlur={apply}
            onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
            className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      </div>

      {(amountMin || amountMax) && (
        <button onClick={clear}
          className="w-full text-xs text-center py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          Clear
        </button>
      )}
    </div>
  );
}

// ── Table Component ──────────────────────────────────────────────────

export function TransactionTable({
  transactions,
  flatCategories,
  funds = [],
  allTags,
  onUpdate,
  updatingId,
  selectedIds,
  onSelectionChange,
  columnFilters,
  onColumnFilterChange,
  onTypeChange,
  onDelete,
  onMarkAsTransfer,
  onUnmarkTransfer,
  accountFilterGroups = [],
  categoryFilterGroups = [],
  tagFilterGroups = [],
  stickyOffset = 64,
}: TransactionTableProps) {
  const cf  = columnFilters;
  const setCf = onColumnFilterChange;
  const selectable = !!onSelectionChange;
  const allVisibleIds = transactions.map((t) => t.id);
  const allSelected =
    selectable &&
    allVisibleIds.length > 0 &&
    allVisibleIds.every((id) => selectedIds?.has(id));
  const someSelected =
    selectable && allVisibleIds.some((id) => selectedIds?.has(id));

  const toggleAll = () => {
    if (!onSelectionChange || !selectedIds) return;
    if (allSelected) {
      const next = new Set(selectedIds);
      for (const id of allVisibleIds) next.delete(id);
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      for (const id of allVisibleIds) next.add(id);
      onSelectionChange(next);
    }
  };

  const toggleOne = (id: string) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  };

  const categoryOptions = [
    ...flatCategories.map((c) => ({
      value: c.id,
      label: `${c.icon ?? ""} ${c.name}`.trim(),
    })),
    ...funds.map((f) => ({
      value: `__FUND__${f.id}`,
      label: `${f.icon ?? "💰"} ${f.name}`.trim(),
    })),
  ];

  const fundOptions = useMemo(() =>
    funds.map((f) => ({
      value: `__FUND__${f.id}`,
      label: `${f.icon ?? "💰"} ${f.name}`.trim(),
    })),
    [funds]
  );

  const categoryOptionGroups = useMemo(() => {
    const groupMap = new Map<string, { value: string; label: string }[]>();
    for (const c of flatCategories) {
      const group = c.groupName;
      if (!groupMap.has(group)) groupMap.set(group, []);
      groupMap.get(group)!.push({ value: c.id, label: `${c.icon ?? ""} ${c.name}`.trim() });
    }
    const groups = Array.from(groupMap.entries()).map(([label, options]) => ({ label, options }));
    // Add funds as a separate group at the bottom
    if (fundOptions.length > 0) {
      groups.push({ label: "💰 Funds", options: fundOptions });
    }
    return groups;
  }, [flatCategories, fundOptions]);

  // Compute amount bounds from loaded transactions (display values, not cents)
  const amountBounds = useMemo(() => {
    if (transactions.length === 0) return { min: -1000, max: 1000 };
    const amounts = transactions.map((t) => t.amount / 100);
    return { min: Math.floor(Math.min(...amounts)), max: Math.ceil(Math.max(...amounts)) };
  }, [transactions]);

  return (
    // overflow-y-auto + max-h makes this a self-contained scroll area,
    // which allows the sticky thead to work correctly.
    <div className="overflow-x-clip">
      <table className="w-full text-sm min-w-[760px]">
        <thead className="sticky z-10" style={{ top: stickyOffset }}>
          <tr className="border-y border-border bg-card">
            {selectable && (
              <th className="py-2 px-2 w-[40px] text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={toggleAll}
                  className="rounded border-border"
                />
              </th>
            )}

            {/* Date */}
            <th className="py-2 px-2 w-[110px]">
              {cf && setCf ? (
                <ColumnHeaderFilter
                  label="Date"
                  active={!!(cf.dateFrom || cf.dateTo)}
                >
                  {(close) => (
                    <ColumnMonthPicker
                      dateFrom={cf.dateFrom}
                      dateTo={cf.dateTo}
                      onChange={(from, to) => { setCf("dateFrom", from); setCf("dateTo", to); }}
                      close={close}
                    />
                  )}
                </ColumnHeaderFilter>
              ) : (
                <span className="text-left font-medium text-xs text-muted-foreground">Date</span>
              )}
            </th>

            {/* Name – with search filter */}
            <th className="py-2 px-2 text-left font-medium text-xs text-muted-foreground">
              {cf && setCf ? (
                <ColumnHeaderFilter
                  label="Name"
                  active={!!cf.search}
                >
                  {(close) => (
                    <ColumnSearchInput
                      search={cf.search}
                      onChange={(s) => setCf("search", s)}
                      close={close}
                    />
                  )}
                </ColumnHeaderFilter>
              ) : (
                <span>Name</span>
              )}
            </th>

            {/* Account */}
            <th className="py-2 px-2 w-[130px] hidden md:table-cell">
              {cf && setCf && accountFilterGroups.length > 0 ? (
                <ColumnHeaderFilter
                  label="Account"
                  active={cf.accountIds.length > 0}
                >
                  {(close) => (
                    <ColumnMultiSelect
                      groups={accountFilterGroups}
                      selected={cf.accountIds}
                      onChange={(ids) => setCf("accountIds", ids)}
                      close={close}
                    />
                  )}
                </ColumnHeaderFilter>
              ) : (
                <span className="text-left font-medium text-xs text-muted-foreground">Account</span>
              )}
            </th>

            {/* Category */}
            <th className="py-2 px-2 w-[140px]">
              {cf && setCf && onTypeChange ? (
                <ColumnHeaderFilter
                  label="Category"
                  active={cf.categoryIds.length > 0 || cf.uncategorized || cf.type === "TRANSFER"}
                >
                  {(close) => (
                    <ColumnMultiSelect
                      groups={categoryFilterGroups}
                      selected={cf.uncategorized ? [] : cf.categoryIds}
                      onChange={(ids) => { setCf("categoryIds", ids); if (cf.uncategorized) setCf("uncategorized", false); }}
                      toggleLabel="No category"
                      toggleActive={cf.uncategorized}
                      onToggle={() => { setCf("uncategorized", !cf.uncategorized); setCf("categoryIds", []); }}
                      extraToggles={[{
                        label: "Transfer",
                        active: cf.type === "TRANSFER",
                        onToggle: () => onTypeChange(cf.type === "TRANSFER" ? "" : "TRANSFER", cf.type === "TRANSFER" ? "" : cf.transferType),
                        icon: <ArrowLeftRight className={cn("h-3.5 w-3.5 shrink-0", cf.type === "TRANSFER" ? "text-primary" : "text-muted-foreground")} />,
                      }]}
                      close={close}
                    />
                  )}
                </ColumnHeaderFilter>
              ) : (
                <span className="text-left font-medium text-xs text-muted-foreground">Category</span>
              )}
            </th>

            {/* Tags */}
            <th className="py-2 px-2 w-[120px] hidden md:table-cell">
              {cf && setCf ? (
                <ColumnHeaderFilter
                  label="Tags"
                  active={cf.tagIds.length > 0 || cf.noTags}
                >
                  {(close) => (
                    <ColumnMultiSelect
                      groups={tagFilterGroups}
                      selected={cf.noTags ? [] : cf.tagIds}
                      onChange={(ids) => { setCf("tagIds", ids); if (cf.noTags) setCf("noTags", false); }}
                      toggleLabel="No tags"
                      toggleActive={cf.noTags}
                      onToggle={() => { setCf("noTags", !cf.noTags); setCf("tagIds", []); }}
                      close={close}
                    />
                  )}
                </ColumnHeaderFilter>
              ) : (
                <span className="text-left font-medium text-xs text-muted-foreground">Tags</span>
              )}
            </th>

            {/* Amount */}
            <th className="py-2 px-2 w-[110px]">
              {cf && setCf ? (
                <div className="flex justify-end">
                  <ColumnHeaderFilter
                    label="Amount"
                    active={!!(cf.amountMin || cf.amountMax)}
                  >
                    {(close) => (
                      <ColumnAmountRange
                        amountMin={cf.amountMin}
                        amountMax={cf.amountMax}
                        dataMin={amountBounds.min}
                        dataMax={amountBounds.max}
                        onChange={(min, max) => { setCf("amountMin", min); setCf("amountMax", max); }}
                        close={close}
                      />
                    )}
                  </ColumnHeaderFilter>
                </div>
              ) : (
                <span className="text-right font-medium text-xs text-muted-foreground block">Amount</span>
              )}
            </th>

            {/* Notes – icon-only column, no filter */}
            <th className="py-2 px-2 w-[36px]">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground/40 mx-auto" />
            </th>


            <th className="py-2 px-1 w-[32px]">
              <Trash2 className="h-3 w-3 text-muted-foreground/20 mx-auto" />
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((txn) => (
            <TransactionRow
              key={txn.id}
              txn={txn}
              categoryOptions={categoryOptions}
              categoryOptionGroups={categoryOptionGroups}
              allTags={allTags}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onMarkAsTransfer={onMarkAsTransfer}
              onUnmarkTransfer={onUnmarkTransfer}
              isUpdating={updatingId === txn.id}
              selectable={selectable}
              isSelected={selectedIds?.has(txn.id) ?? false}
              onToggleSelect={() => toggleOne(txn.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Row Component ────────────────────────────────────────────────────

function TransactionRow({
  txn,
  categoryOptions,
  categoryOptionGroups,
  allTags,
  onUpdate,
  onDelete,
  onMarkAsTransfer,
  onUnmarkTransfer,
  isUpdating,
  selectable,
  isSelected,
  onToggleSelect,
}: {
  txn: TransactionItem;
  categoryOptions: { value: string; label: string }[];
  categoryOptionGroups: { label: string; options: { value: string; label: string }[] }[];
  allTags: TagOption[];
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  onDelete?: (id: string) => void;
  onMarkAsTransfer?: (txn: TransactionItem) => void;
  onUnmarkTransfer?: (txn: TransactionItem) => void;
  isUpdating: boolean;
  selectable: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const isTransfer = txn.type === "TRANSFER";
  const partnerAccount = txn.linkedTransaction?.account ?? txn.linkedBy?.account ?? null;
  const isOutflow  = txn.amount < 0;
  const isIlliquid = txn.account.type
    ? ACCOUNT_TYPE_META[txn.account.type]?.sidebarGroup === "ILLIQUID"
    : false;
  const AccountIcon   = isIlliquid ? ACCOUNT_TYPE_META[txn.account.type!]?.icon : null;
  const canEditCategory = !isTransfer && !isIlliquid;

  const displayDesc = txn.displayName || txn.description;

  const accountDisplay = isTransfer && partnerAccount
    ? isOutflow
      ? `${txn.account.name} → ${partnerAccount.name}`
      : `${partnerAccount.name} → ${txn.account.name}`
    : isTransfer
      ? `${txn.account.name} (ext)`
      : txn.account.name;

  const categoryDisplay = isTransfer
    ? partnerAccount ? "↔" : "→"
    : isIlliquid && AccountIcon ? ""
    : txn.fund ? `${txn.fund.icon ?? "💰"} ${txn.fund.name}`.trim()
    : txn.category ? `${txn.category.icon ?? ""} ${txn.category.name}`.trim() : "";

  const categoryIcon = isTransfer ? (
    <ArrowLeftRight className={cn("h-4 w-4 inline-block", partnerAccount ? "text-blue-500" : "text-amber-500")} />
  ) : isIlliquid && AccountIcon ? (
    <AccountIcon className="h-4 w-4 inline-block text-muted-foreground" />
  ) : null;

  // Ophelia suggestion — only relevant when user hasn't set a category.
  // Use the pre-loaded opheliaCategory relation directly (avoids visibility mismatch
  // where a PERSONAL-category suggestion wouldn't be found in the SHARED categoryOptions).
  const opheliaCatLabel = !txn.category && txn.opheliaCategory
    ? txn.opheliaCategory.name
    : null;
  const opheliaConf = txn.opheliaConfidence ?? null;
  const opheliaConfColor =
    opheliaConf == null ? "text-violet-400"
    : opheliaConf >= 0.8 ? "text-green-500"
    : opheliaConf >= 0.5 ? "text-yellow-500"
    : "text-red-400";

  return (
    <tr
      className={cn(
        "group border-b border-border/30 hover:bg-muted/20 transition-colors",
        isUpdating && "opacity-60",
        isSelected && "bg-primary/5"
      )}
    >
      {selectable && (
        <td className="py-1.5 px-2">
          <input type="checkbox" checked={isSelected} onChange={onToggleSelect} className="rounded border-border" />
        </td>
      )}

      {/* Date */}
      <td className="py-1.5 px-2">
        {txn.isInitialBalance ? (
          <span className="text-xs text-muted-foreground/50">—</span>
        ) : (
          <>
            <InlineDateEdit value={txn.date} onSave={(date) => onUpdate(txn.id, { date })} />
            <AccrualDateCell txnId={txn.id} accrualDate={txn.accrualDate ?? null} onUpdate={onUpdate} />
          </>
        )}
      </td>

      {/* Name */}
      <td className="py-1.5 px-2 max-w-0">
        <InlineTextEdit
          value={displayDesc}
          onSave={(value) => onUpdate(txn.id, { displayName: value })}
          className="font-medium"
          maxLength={100}
        />
        {txn.displayName && txn.displayName !== txn.description && (
          <span className="text-xs text-muted-foreground/50 truncate block" title={txn.description}>
            {txn.description.length > 50 ? txn.description.slice(0, 50) + "..." : txn.description}
          </span>
        )}
      </td>

      {/* Account */}
      <td className="py-1.5 px-2 hidden md:table-cell">
        <span className="text-xs text-muted-foreground truncate block" title={accountDisplay}>
          {accountDisplay}
        </span>
      </td>

      {/* Category */}
      <td className="py-1.5 px-2">
        {isTransfer ? (
          // Transfer indicator — clickable to unmark
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs px-1 py-0.5 rounded cursor-pointer transition-colors hover:bg-muted/50",
              partnerAccount ? "text-blue-500" : "text-amber-500"
            )}
            onClick={() => onUnmarkTransfer?.(txn)}
            title="Click to undo transfer"
          >
            <ArrowLeftRight className="h-3 w-3 shrink-0" />
            <span className="truncate">
              Transfer{partnerAccount ? ` → ${partnerAccount.name}` : ""}
            </span>
          </span>
        ) : canEditCategory ? (
          opheliaCatLabel && !txn.category ? (
            // Ophelia suggestion: no user category set, AI has a candidate
            <div className="flex items-center gap-1 group/ophelia">
              <span title={opheliaConf != null ? `Ophelia: ${Math.round(opheliaConf * 100)}% confidence` : "Suggested by Ophelia"}>
                <Sparkles className={cn("h-3 w-3 shrink-0", opheliaConfColor)} />
              </span>
              <InlineSelectEdit
                value=""
                displayValue={opheliaCatLabel}
                options={categoryOptions}
                optionGroups={categoryOptionGroups}
                topOptions={onMarkAsTransfer ? [{ value: "__TRANSFER__", label: "↔ Mark as transfer" }] : undefined}
                onSave={(value) => {
                  if (value === "__TRANSFER__") { onMarkAsTransfer?.(txn); return; }
                  if (value.startsWith("__FUND__")) {
                    onUpdate(txn.id, { fundId: value.replace("__FUND__", ""), categoryId: null });
                  } else {
                    onUpdate(txn.id, { categoryId: value || null, fundId: null });
                  }
                }}
                emptyLabel="Uncategorized"
                placeholder="—"
              />
              <button
                type="button"
                title={`Accept Ophelia's suggestion: ${opheliaCatLabel}`}
                onClick={() => onUpdate(txn.id, { categoryId: txn.opheliaCategoryId })}
                className="shrink-0 opacity-0 group-hover/ophelia:opacity-100 text-[10px] text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-200 transition-opacity font-medium leading-none"
              >
                Accept
              </button>
            </div>
          ) : (
            <InlineSelectEdit
              value={txn.fund ? `__FUND__${txn.fund.id}` : txn.category?.id ?? ""}
              displayValue={categoryDisplay}
              options={categoryOptions}
              optionGroups={categoryOptionGroups}
              topOptions={onMarkAsTransfer ? [{ value: "__TRANSFER__", label: "↔ Mark as transfer" }] : undefined}
              onSave={(value) => {
                if (value === "__TRANSFER__") { onMarkAsTransfer?.(txn); return; }
                if (value.startsWith("__FUND__")) {
                  onUpdate(txn.id, { fundId: value.replace("__FUND__", ""), categoryId: null });
                } else {
                  onUpdate(txn.id, { categoryId: value || null, fundId: null });
                }
              }}
              emptyLabel="Uncategorized"
              placeholder="—"
            />
          )
        ) : (
          <span className="text-sm px-1 py-0.5">{categoryIcon}</span>
        )}
      </td>

      {/* Tags */}
      <td className="py-1.5 px-2 hidden md:table-cell">
        <InlineTagEdit
          selectedTagIds={txn.tags.map((t) => t.tag.id)}
          allTags={allTags}
          onSave={(tagIds) => onUpdate(txn.id, { tagIds })}
        />
      </td>

      {/* Amount */}
      <td className="py-1.5 px-2 text-right whitespace-nowrap">
        <InlineMoneyEdit
          value={txn.amount}
          onSave={(cents) => onUpdate(txn.id, { amount: cents })}
          className={cn(
            txn.amount > 0 && "text-green-600 dark:text-green-400",
            txn.amount < 0 && "text-red-600 dark:text-red-400"
          )}
        />
      </td>

      {/* Notes */}
      <td className="py-1.5 px-2">
        <NoteCell txnId={txn.id} notes={txn.notes} onUpdate={onUpdate} />
      </td>


      {/* Delete */}
      <td className="py-1.5 px-1">
        {onDelete && !txn.isInitialBalance && <DeleteCell txnId={txn.id} onDelete={onDelete} />}
      </td>
    </tr>
  );
}

// ── Accrual date cell ─────────────────────────────────────────────────

function AccrualDateCell({
  txnId, accrualDate, onUpdate,
}: {
  txnId: string;
  accrualDate: Date | string | null;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
}) {
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.showPicker?.();
    }
  }, [adding]);

  if (accrualDate) {
    return (
      <div className="flex items-center gap-0.5 mt-0.5">
        <InlineDateEdit
          value={accrualDate}
          onSave={(date) => onUpdate(txnId, { accrualDate: date })}
          className="text-xs text-amber-600 dark:text-amber-400"
        />
        <button
          onClick={() => onUpdate(txnId, { accrualDate: null })}
          className="text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors"
          title="Clear budget date"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>
    );
  }

  if (adding) {
    return (
      <input
        ref={inputRef}
        type="date"
        onBlur={() => setAdding(false)}
        onKeyDown={(e) => { if (e.key === "Escape") setAdding(false); }}
        onChange={(e) => {
          const val = e.target.value;
          if (val) {
            onUpdate(txnId, { accrualDate: new Date(val + "T12:00:00") });
            setAdding(false);
          }
        }}
        className="bg-transparent border-0 border-b border-amber-400/50 outline-none text-xs py-0 px-0.5 rounded-none text-amber-600 dark:text-amber-400 w-[72px] mt-0.5"
      />
    );
  }

  return (
    <button
      onClick={() => setAdding(true)}
      className="text-xs text-muted-foreground/0 group-hover:text-muted-foreground/30 hover:!text-muted-foreground/60 transition-colors mt-0.5 block leading-none"
      title="Set budget date"
    >
      +BD
    </button>
  );
}

// ── Delete Cell ───────────────────────────────────────────────────────

function DeleteCell({
  txnId, onDelete,
}: {
  txnId: string;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!(target as Element).closest?.("[data-delete-cell]")) {
        setConfirming(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [confirming]);

  if (confirming) {
    return (
      <div className="flex items-center gap-0.5" data-delete-cell>
        <button
          onClick={() => { onDelete(txnId); setConfirming(false); }}
          className="h-5 px-1.5 text-[10px] rounded bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
        >
          Del
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title="Delete transaction"
      className="flex items-center justify-center w-full text-muted-foreground/0 group-hover:text-muted-foreground/30 hover:!text-red-500 transition-colors"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

// ── Note Cell ─────────────────────────────────────────────────────────

function NoteCell({
  txnId, notes, onUpdate,
}: {
  txnId: string;
  notes?: string | null;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const openEdit = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popW = 220;
      const left = Math.max(8, Math.min(rect.left - popW + rect.width, window.innerWidth - popW - 8));
      setPos({ top: rect.bottom + 4, left });
    }
    setDraft(notes ?? "");
    setEditing(true);
  };

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) return;
      const trimmed = draftRef.current.trim();
      onUpdate(txnId, { notes: trimmed || null });
      setEditing(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editing, txnId, onUpdate]);

  const save = () => {
    const trimmed = draft.trim();
    onUpdate(txnId, { notes: trimmed || null });
    setEditing(false);
  };

  const cancel = () => setEditing(false);
  const clear = () => { onUpdate(txnId, { notes: null }); setEditing(false); };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={openEdit}
        title={notes ?? "Add note"}
        className={cn(
          "flex items-center justify-center w-full transition-colors",
          notes
            ? "text-primary/70 hover:text-primary"
            : "text-muted-foreground/0 group-hover:text-muted-foreground/30 hover:!text-muted-foreground/60"
        )}
      >
        <MessageSquare className="h-3.5 w-3.5" />
      </button>
      {editing && (
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="rounded-lg border bg-popover shadow-lg w-[220px] p-2 space-y-2"
        >
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); cancel(); }
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
            }}
            className="w-full min-h-[80px] text-xs rounded border border-input bg-background px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring resize-none"
            placeholder="Add a note…"
            rows={4}
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              className="flex-1 h-6 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              Save
            </button>
            {notes && (
              <button
                onClick={clear}
                className="h-6 px-2 rounded border border-input text-xs text-muted-foreground hover:bg-muted transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
