"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterOptionGroup {
  label: string;
  options: { value: string; label: string; icon?: string }[];
}

interface MultiSelectFilterProps {
  label: string;
  groups: FilterOptionGroup[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}

export function MultiSelectFilter({
  label,
  groups,
  selected,
  onChange,
  className,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const totalOptions = groups.reduce((sum, g) => sum + g.options.length, 0);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search when opening
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  const toggleValue = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  const toggleGroup = (group: FilterOptionGroup) => {
    const groupValues = group.options.map((o) => o.value);
    const allSelected = groupValues.every((v) => selected.includes(v));
    if (allSelected) {
      onChange(selected.filter((v) => !groupValues.includes(v)));
    } else {
      const newSelected = new Set([...selected, ...groupValues]);
      onChange(Array.from(newSelected));
    }
  };

  // Filter options by search
  const filteredGroups = search
    ? groups
        .map((g) => ({
          ...g,
          options: g.options.filter((o) =>
            o.label.toLowerCase().includes(search.toLowerCase())
          ),
        }))
        .filter((g) => g.options.length > 0)
    : groups;

  const hasSelection = selected.length > 0;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 h-10 px-3 rounded-md border border-input bg-background text-sm transition-colors hover:bg-muted whitespace-nowrap",
          hasSelection && "border-primary/50"
        )}
      >
        <span className={hasSelection ? "text-foreground" : "text-muted-foreground"}>
          {hasSelection ? `${label} (${selected.length})` : label}
        </span>
        {hasSelection ? (
          <X
            className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
          />
        ) : (
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        )}
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 rounded-lg border bg-popover shadow-lg w-[260px] max-h-[320px] flex flex-col">
          {/* Search */}
          {totalOptions > 8 && (
            <div className="p-2 border-b border-border">
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

          {/* Options */}
          <div className="overflow-y-auto p-1.5 flex-1">
            {filteredGroups.map((group, gi) => {
              const groupValues = group.options.map((o) => o.value);
              const allGroupSelected = groupValues.length > 0 && groupValues.every((v) => selected.includes(v));
              const someGroupSelected = groupValues.some((v) => selected.includes(v));

              return (
                <div key={gi}>
                  {/* Group header — only show if more than one group */}
                  {groups.length > 1 && (
                    <button
                      onClick={() => toggleGroup(group)}
                      className="flex items-center gap-2 w-full text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5 mt-1 first:mt-0 hover:bg-muted/50 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={allGroupSelected}
                        ref={(el) => { if (el) el.indeterminate = someGroupSelected && !allGroupSelected; }}
                        onChange={() => toggleGroup(group)}
                        className="rounded border-border"
                        onClick={(e) => e.stopPropagation()}
                      />
                      {group.label}
                    </button>
                  )}

                  {/* Options */}
                  {group.options.map((option) => {
                    const isChecked = selected.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleValue(option.value)}
                          className="rounded border-border"
                        />
                        {option.icon && <span className="text-xs">{option.icon}</span>}
                        <span className="truncate">{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              );
            })}

            {filteredGroups.length === 0 && (
              <p className="text-xs text-muted-foreground/50 text-center py-3">No matches</p>
            )}
          </div>

          {/* Footer */}
          {hasSelection && (
            <div className="border-t border-border p-1.5">
              <button
                onClick={() => onChange([])}
                className="w-full text-xs text-center py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
