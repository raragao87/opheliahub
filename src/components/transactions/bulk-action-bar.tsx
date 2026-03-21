"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Tag,
  Tags,
  FolderEdit,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FilterOptionGroup } from "@/components/shared/multi-select-filter";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────

interface TagOption {
  id: string;
  name: string;
  color?: string | null;
}

interface SelectedTransactionInfo {
  id: string;
  importBatchId?: string | null;
}

interface FundOption {
  id: string;
  name: string;
  icon?: string | null;
}

interface BulkActionBarProps {
  selectedCount: number;
  selectedTransactions: SelectedTransactionInfo[];
  onDeselectAll: () => void;
  // Category action
  categoryGroups: FilterOptionGroup[];
  funds?: FundOption[];
  onBulkChangeCategory: (categoryId: string | null) => void;
  // Tag actions
  allTags: TagOption[];
  onBulkAddTags: (tagIds: string[]) => void;
  onBulkRemoveTags: (tagIds: string[]) => void;
  // Delete action
  onBulkDelete: () => void;
  // Loading state
  isPending: boolean;
}

// ── Main Component ───────────────────────────────────────────────────

export function BulkActionBar({
  selectedCount,
  selectedTransactions,
  onDeselectAll,
  categoryGroups,
  funds = [],
  onBulkChangeCategory,
  allTags,
  onBulkAddTags,
  onBulkRemoveTags,
  onBulkDelete,
  isPending,
}: BulkActionBarProps) {
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const closeAction = useCallback(() => setActiveAction(null), []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeAction) {
          setActiveAction(null);
        } else {
          onDeselectAll();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeAction, onDeselectAll]);

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-3xl px-4">
      <div className="relative rounded-xl border bg-popover shadow-2xl px-4 py-3">
        {/* Pending overlay */}
        {isPending && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-popover/80">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="ml-2 text-sm font-medium">Processing...</span>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          {/* Selection count */}
          <div className="flex items-center gap-2 mr-1">
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
              {selectedCount}
            </span>
            <span className="text-sm font-medium whitespace-nowrap">
              selected
            </span>
            <button
              onClick={onDeselectAll}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Deselect all (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Category */}
            <ActionButton
              icon={FolderEdit}
              label="Category"
              isActive={activeAction === "category"}
              onClick={() => setActiveAction(activeAction === "category" ? null : "category")}
            />

            {/* Add Tags */}
            <ActionButton
              icon={Tag}
              label="Add tags"
              isActive={activeAction === "addTags"}
              onClick={() => setActiveAction(activeAction === "addTags" ? null : "addTags")}
            />

            {/* Remove Tags */}
            <ActionButton
              icon={Tags}
              label="Remove tags"
              isActive={activeAction === "removeTags"}
              onClick={() => setActiveAction(activeAction === "removeTags" ? null : "removeTags")}
            />

            <div className="h-5 w-px bg-border" />

            {/* Delete */}
            <ActionButton
              icon={Trash2}
              label="Delete"
              isActive={activeAction === "delete"}
              onClick={() => setActiveAction(activeAction === "delete" ? null : "delete")}
              variant="destructive"
            />
          </div>
        </div>

        {/* Action popovers */}
        {activeAction === "category" && (
          <CategoryPicker
            groups={categoryGroups}
            funds={funds}
            onSelect={(id) => {
              onBulkChangeCategory(id);
              closeAction();
            }}
            onClose={closeAction}
          />
        )}

        {activeAction === "addTags" && (
          <TagPicker
            allTags={allTags}
            mode="add"
            onConfirm={(tagIds) => {
              onBulkAddTags(tagIds);
              closeAction();
            }}
            onClose={closeAction}
          />
        )}

        {activeAction === "removeTags" && (
          <TagPicker
            allTags={allTags}
            mode="remove"
            onConfirm={(tagIds) => {
              onBulkRemoveTags(tagIds);
              closeAction();
            }}
            onClose={closeAction}
          />
        )}

        {activeAction === "delete" && (
          <DeleteConfirmation
            count={selectedCount}
            hasImported={selectedTransactions.some((t) => t.importBatchId)}
            onConfirm={() => {
              onBulkDelete();
              closeAction();
            }}
            onClose={closeAction}
          />
        )}
      </div>
    </div>
  );
}

// ── Shared Action Button ─────────────────────────────────────────────

function ActionButton({
  icon: Icon,
  label,
  isActive,
  onClick,
  variant,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  onClick: () => void;
  variant?: "destructive";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
        variant === "destructive"
          ? isActive
            ? "bg-destructive/10 text-destructive"
            : "text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
          : isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ── Category Picker ──────────────────────────────────────────────────

function CategoryPicker({
  groups,
  funds = [],
  onSelect,
  onClose,
}: {
  groups: FilterOptionGroup[];
  funds?: FundOption[];
  onSelect: (categoryId: string | null) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useClickOutside(ref, onClose);

  const lc = search.toLowerCase();
  const filteredGroups = search
    ? groups
        .map((g) => ({
          ...g,
          options: g.options.filter((o) =>
            o.label.toLowerCase().includes(lc)
          ),
        }))
        .filter((g) => g.options.length > 0)
    : groups;

  const filteredFunds = search
    ? funds.filter((f) => f.name.toLowerCase().includes(lc))
    : funds;

  return (
    <div ref={ref} className="absolute bottom-full left-0 mb-2 rounded-lg border bg-popover shadow-lg w-[280px] max-h-[320px] flex flex-col">
      <div className="p-2 border-b border-border">
        <input
          ref={searchRef}
          type="text"
          placeholder="Search categories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
        />
      </div>
      <div className="overflow-y-auto p-1.5 flex-1">
        {/* Clear category option */}
        <button
          onClick={() => onSelect(null)}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          Remove category
        </button>
        <div className="h-px bg-border my-1" />

        {filteredGroups.map((group, gi) => (
          <div key={gi}>
            {groups.length > 1 && (
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 mt-1 first:mt-0">
                {group.label}
              </div>
            )}
            {group.options.map((option) => (
              <button
                key={option.value}
                onClick={() => onSelect(option.value)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted text-foreground transition-colors"
              >
                {option.icon && <span className="text-xs">{option.icon}</span>}
                <span className="truncate">{option.label}</span>
              </button>
            ))}
          </div>
        ))}

        {/* Funds section */}
        {filteredFunds.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 mt-1 border-t border-border/40 pt-2">
              Funds
            </div>
            {filteredFunds.map((fund) => (
              <button
                key={fund.id}
                onClick={() => onSelect(`__FUND__${fund.id}`)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted text-foreground transition-colors"
              >
                <span className="text-xs">{fund.icon ?? "💰"}</span>
                <span className="truncate">{fund.name}</span>
              </button>
            ))}
          </div>
        )}

        {filteredGroups.length === 0 && filteredFunds.length === 0 && (
          <p className="text-xs text-muted-foreground/50 text-center py-3">No categories found</p>
        )}
      </div>
    </div>
  );
}

// ── Tag Picker ───────────────────────────────────────────────────────

function TagPicker({
  allTags,
  mode,
  onConfirm,
  onClose,
}: {
  allTags: TagOption[];
  mode: "add" | "remove";
  onConfirm: (tagIds: string[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useClickOutside(ref, onClose);

  const filtered = search
    ? allTags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : allTags;

  const toggleTag = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div ref={ref} className="absolute bottom-full left-0 mb-2 rounded-lg border bg-popover shadow-lg w-[260px] max-h-[320px] flex flex-col">
      <div className="p-2 border-b border-border">
        <input
          ref={searchRef}
          type="text"
          placeholder={mode === "add" ? "Search tags to add..." : "Search tags to remove..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
        />
      </div>
      <div className="overflow-y-auto p-1.5 flex-1">
        {filtered.map((tag) => (
          <label
            key={tag.id}
            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm"
          >
            <input
              type="checkbox"
              checked={selected.has(tag.id)}
              onChange={() => toggleTag(tag.id)}
              className="rounded border-border"
            />
            {tag.color && (
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: tag.color }}
              />
            )}
            <span className="truncate">{tag.name}</span>
          </label>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground/50 text-center py-3">No tags found</p>
        )}
      </div>
      {selected.size > 0 && (
        <div className="border-t border-border p-2">
          <Button
            size="sm"
            className="w-full"
            onClick={() => onConfirm(Array.from(selected))}
          >
            {mode === "add" ? "Add" : "Remove"} {selected.size} tag{selected.size !== 1 ? "s" : ""}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Delete Confirmation ──────────────────────────────────────────────

function DeleteConfirmation({
  count,
  hasImported,
  onConfirm,
  onClose,
}: {
  count: number;
  hasImported: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  return (
    <div ref={ref} className="absolute bottom-full right-0 mb-2 rounded-lg border bg-popover shadow-lg w-[320px] p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-destructive/10 p-2 shrink-0">
          <Trash2 className="h-4 w-4 text-destructive" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Delete {count} transaction{count !== 1 ? "s" : ""}?</h3>
          <p className="text-xs text-muted-foreground mt-1">
            This action cannot be undone. Account balances will be adjusted accordingly.
          </p>
        </div>
      </div>

      {hasImported && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Some selected transactions were imported. Re-importing may recreate them.
          </p>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onConfirm}
        >
          Delete {count}
        </Button>
      </div>
    </div>
  );
}

// ── Hook: click outside ──────────────────────────────────────────────

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const listener = (e: MouseEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler();
    };
    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, [ref, handler]);
}
