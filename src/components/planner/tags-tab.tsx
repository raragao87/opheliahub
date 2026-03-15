"use client";

import { useState, useMemo } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { MoneyDisplay } from "@/components/shared/money-display";
import { cn } from "@/lib/utils";
import { Tag, Loader2, Calendar, ChevronDown } from "lucide-react";

interface TagsTabProps {
  month: number;
  year: number;
  visibility: "SHARED" | "PERSONAL";
}

// Period presets
const PERIOD_PRESETS = [
  { label: "All time", getRange: () => ({ from: undefined, to: undefined }) },
  { label: "This year", getRange: () => ({ from: new Date(new Date().getFullYear(), 0, 1), to: undefined }) },
  { label: "Last 12 mo", getRange: () => {
    const d = new Date(); d.setMonth(d.getMonth() - 12);
    return { from: d, to: undefined };
  }},
  { label: "Last 6 mo", getRange: () => {
    const d = new Date(); d.setMonth(d.getMonth() - 6);
    return { from: d, to: undefined };
  }},
] as const;

function formatShortDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatMonth(d: Date | string) {
  return new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function TagsTab({ visibility }: TagsTabProps) {
  const trpc = useTRPC();

  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [periodIdx, setPeriodIdx] = useState(0);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);

  const tagsQuery = useQuery(trpc.tag.list.queryOptions({ visibility }));
  const allTags = tagsQuery.data ?? [];

  // Group tags for the dropdown
  const tagGroups = useMemo(() => {
    const grouped = new Map<string, { label: string; tags: typeof allTags }>();
    for (const tag of allTags) {
      const key = tag.group?.name ?? "__ungrouped__";
      if (!grouped.has(key)) grouped.set(key, { label: tag.group?.name ?? "Tags", tags: [] });
      grouped.get(key)!.tags.push(tag);
    }
    return Array.from(grouped.values());
  }, [allTags]);

  const hasGroups = tagGroups.length > 1;
  const selectedTag = allTags.find((t) => t.id === selectedTagId);

  const period = PERIOD_PRESETS[periodIdx].getRange();

  const analysisQuery = useQuery({
    ...trpc.tag.tagAnalysis.queryOptions({
      tagIds: selectedTagId ? [selectedTagId] : [],
      dateFrom: period.from,
      dateTo: period.to,
      visibility,
    }),
    enabled: !!selectedTagId,
  });

  const analysis = analysisQuery.data?.tags[0];

  if (allTags.length === 0 && !tagsQuery.isLoading) {
    return (
      <div className="text-center py-12 space-y-3">
        <Tag className="h-10 w-10 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground">
          No tags created yet. Add tags to your transactions to analyze spending by trip, subscription, project, or event.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Tag selector + period ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Tag dropdown */}
        <div className="relative">
          <button
            onClick={() => setTagDropdownOpen(!tagDropdownOpen)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors min-w-[180px]",
              selectedTag ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/50"
            )}
          >
            <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="flex-1 text-left truncate">
              {selectedTag ? selectedTag.name : "Select a tag..."}
            </span>
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", tagDropdownOpen && "rotate-180")} />
          </button>

          {tagDropdownOpen && (
            <TagDropdown
              tagGroups={tagGroups}
              hasGroups={hasGroups}
              selectedId={selectedTagId}
              onSelect={(id) => { setSelectedTagId(id); setTagDropdownOpen(false); }}
              onClose={() => setTagDropdownOpen(false)}
            />
          )}
        </div>

        {/* Period presets */}
        <div className="flex gap-1">
          {PERIOD_PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => setPeriodIdx(i)}
              className={cn(
                "text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors",
                periodIdx === i
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Analysis content ───────────────────────────────────── */}
      {!selectedTagId && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Select a tag to see spending analysis
        </div>
      )}

      {selectedTagId && analysisQuery.isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {analysis && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Total spent</p>
              <MoneyDisplay amount={analysis.totalAmount} className="text-lg font-bold" />
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Transactions</p>
              <p className="text-lg font-bold">{analysis.transactionCount}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Period</p>
              <p className="text-sm font-medium text-muted-foreground">
                {analysis.dateRange
                  ? `${formatMonth(analysis.dateRange.first)} – ${formatMonth(analysis.dateRange.last)}`
                  : "—"}
              </p>
            </div>
          </div>

          {analysis.transactionCount === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No transactions found for this tag in the selected period.</p>
          ) : (
            <>
              {/* Category breakdown */}
              <div className="rounded-lg border bg-card p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">By category</p>
                <div className="space-y-1.5">
                  {analysis.byCategory.map((cat) => {
                    const pct = analysis.totalAmount !== 0 ? Math.abs(cat.amount / analysis.totalAmount) * 100 : 0;
                    return (
                      <div key={cat.categoryId ?? "__none__"} className="flex items-center gap-2">
                        <span className="text-sm w-5 shrink-0">{cat.categoryIcon ?? "📄"}</span>
                        <span className="text-sm flex-1 min-w-0 truncate">{cat.categoryName ?? "Uncategorized"}</span>
                        <MoneyDisplay amount={cat.amount} className="text-sm font-medium shrink-0 tabular-nums whitespace-nowrap" />
                        <span className="text-[10px] text-muted-foreground w-10 text-right tabular-nums shrink-0">{Math.round(pct)}%</span>
                        <div className="w-20 h-1.5 rounded-full bg-muted shrink-0 hidden sm:block">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Monthly trend */}
              {analysis.byMonth.length > 1 && (
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">Monthly trend</p>
                  <div className="flex items-end gap-1 h-24">
                    {(() => {
                      const maxAbs = Math.max(...analysis.byMonth.map((m) => Math.abs(m.amount)), 1);
                      return analysis.byMonth.map((m) => {
                        const height = (Math.abs(m.amount) / maxAbs) * 100;
                        return (
                          <div key={`${m.year}-${m.month}`} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                            <div className="w-full flex items-end justify-center" style={{ height: "80px" }}>
                              <div
                                className={cn("w-full max-w-[32px] rounded-t", m.amount >= 0 ? "bg-green-500" : "bg-red-400")}
                                style={{ height: `${Math.max(height, 4)}%` }}
                                title={`${m.label}: ${(m.amount / 100).toFixed(2)}`}
                              />
                            </div>
                            <span className="text-[9px] text-muted-foreground truncate w-full text-center">{m.label}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* Account breakdown */}
              {analysis.byAccount.length > 1 && (
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">By account</p>
                  <div className="space-y-1.5">
                    {analysis.byAccount.map((acc) => {
                      const pct = analysis.totalAmount !== 0 ? Math.abs(acc.amount / analysis.totalAmount) * 100 : 0;
                      return (
                        <div key={acc.accountId} className="flex items-center gap-2">
                          <span className="text-sm flex-1 min-w-0 truncate">{acc.accountName}</span>
                          <MoneyDisplay amount={acc.amount} className="text-sm font-medium shrink-0 tabular-nums whitespace-nowrap" />
                          <span className="text-[10px] text-muted-foreground w-10 text-right tabular-nums shrink-0">{Math.round(pct)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent transactions */}
              <div className="rounded-lg border bg-card p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">Recent transactions</p>
                <div className="space-y-0.5">
                  {analysis.recentTransactions.map((txn) => (
                    <div key={txn.id} className="flex items-center gap-3 py-1.5 hover:bg-muted/20 rounded px-1 -mx-1 transition-colors">
                      <span className="text-xs text-muted-foreground w-16 shrink-0 tabular-nums">{formatShortDate(txn.date)}</span>
                      <span className="text-xs shrink-0">{txn.categoryIcon ?? "📄"}</span>
                      <span className="text-sm flex-1 min-w-0 truncate">{txn.displayName || txn.description}</span>
                      <span className="text-xs text-muted-foreground hidden sm:block shrink-0">{txn.accountName}</span>
                      <MoneyDisplay amount={txn.amount} className="text-sm font-medium shrink-0 tabular-nums whitespace-nowrap" />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tag Dropdown ─────────────────────────────────────────────────────

function TagDropdown({
  tagGroups,
  hasGroups,
  selectedId,
  onSelect,
  onClose,
}: {
  tagGroups: Array<{ label: string; tags: Array<{ id: string; name: string; _count: { transactions: number } }> }>;
  hasGroups: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? tagGroups
        .map((g) => ({ ...g, tags: g.tags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase())) }))
        .filter((g) => g.tags.length > 0)
    : tagGroups;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg min-w-[220px] max-h-[320px] flex flex-col">
        <div className="p-2 border-b border-border shrink-0">
          <input
            type="text"
            placeholder="Search tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            autoFocus
          />
        </div>
        <div className="p-1.5 overflow-y-auto flex-1">
          {filtered.map((group, gi) => (
            <div key={gi} className={gi > 0 && hasGroups ? "mt-1 pt-1 border-t border-border/40" : ""}>
              {hasGroups && (
                <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider px-2 py-1">{group.label}</p>
              )}
              {group.tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => onSelect(tag.id)}
                  className={cn(
                    "flex items-center gap-2 w-full py-1.5 rounded text-sm text-left transition-colors",
                    hasGroups ? "pl-4 pr-2" : "px-2",
                    selectedId === tag.id ? "bg-primary/10 text-foreground font-medium" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="flex-1 truncate">{tag.name}</span>
                  <span className="text-[10px] text-muted-foreground/50 tabular-nums">{tag._count.transactions}</span>
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground/50 text-center py-3">No matches</p>
          )}
        </div>
      </div>
    </>
  );
}
