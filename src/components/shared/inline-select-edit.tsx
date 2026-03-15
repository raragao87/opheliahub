"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";

interface InlineSelectOption {
  value: string;
  label: string;
}

interface InlineSelectOptionGroup {
  label: string;
  options: InlineSelectOption[];
}

interface InlineSelectEditProps {
  value: string;
  displayValue: string;
  options: InlineSelectOption[];
  /** When provided, options are rendered inside groups */
  optionGroups?: InlineSelectOptionGroup[];
  /** Options rendered before the groups (e.g. special actions) */
  topOptions?: InlineSelectOption[];
  onSave: (value: string) => void;
  placeholder?: string;
  className?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}

export function InlineSelectEdit({
  value,
  displayValue,
  options,
  optionGroups,
  topOptions,
  onSave,
  placeholder = "—",
  className,
  allowEmpty = true,
  emptyLabel = "None",
}: InlineSelectEditProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  // Focus search + reset on open
  useEffect(() => {
    if (open) { setSearch(""); setTimeout(() => searchRef.current?.focus(), 0); }
  }, [open]);

  const handleSelect = (newValue: string) => {
    setOpen(false);
    if (newValue !== value) {
      onSave(newValue);
    }
  };

  // Filter groups/options by search
  const groups = useMemo(() => {
    const src = optionGroups ?? [{ label: "", options }];
    if (!search) return src;
    return src
      .map((g) => ({
        ...g,
        options: g.options.filter((o) =>
          o.label.toLowerCase().includes(search.toLowerCase())
        ),
      }))
      .filter((g) => g.options.length > 0);
  }, [optionGroups, options, search]);

  // Filter top options by search
  const filteredTopOptions = useMemo(() => {
    if (!topOptions) return [];
    if (!search) return topOptions;
    return topOptions.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()));
  }, [topOptions, search]);

  const hasGroups = (optionGroups?.length ?? 0) > 1;
  const totalOptions = groups.reduce((s, g) => s + g.options.length, 0) + filteredTopOptions.length;

  return (
    <div ref={containerRef} className="relative">
      <span
        onClick={() => setOpen(!open)}
        className={cn(
          "text-sm cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-muted/50 truncate block",
          !displayValue && "text-muted-foreground/50",
          className
        )}
      >
        {displayValue || placeholder}
      </span>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-popover border border-border rounded-md shadow-lg min-w-[200px] max-h-[300px] flex flex-col">
          {/* Search */}
          <div className="p-2 border-b border-border shrink-0">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="p-1.5 space-y-0.5 overflow-y-auto flex-1">
            {/* Top options (e.g. "Mark as transfer") */}
            {filteredTopOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className="flex items-center gap-2 w-full px-2 py-1 rounded text-sm text-left hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                {opt.label}
              </button>
            ))}
            {filteredTopOptions.length > 0 && groups.length > 0 && (
              <div className="border-t border-border/40 my-1" />
            )}

            {/* Empty / uncategorized option */}
            {allowEmpty && !search && (
              <button
                onClick={() => handleSelect("")}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1 rounded text-sm text-left transition-colors",
                  value === "" ? "bg-primary/10 text-foreground font-medium" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
              >
                {emptyLabel}
              </button>
            )}

            {/* Grouped options */}
            {groups.map((group, gi) => (
              <div key={gi} className={gi > 0 && hasGroups ? "mt-1 pt-1 border-t border-border/40" : ""}>
                {hasGroups && group.label && (
                  <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider px-2 py-1">
                    {group.label}
                  </p>
                )}
                {group.options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "flex items-center gap-2 w-full py-1 rounded text-sm text-left transition-colors",
                      hasGroups ? "pl-4 pr-2" : "px-2",
                      value === opt.value
                        ? "bg-primary/10 text-foreground font-medium"
                        : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
            ))}

            {totalOptions === 0 && (
              <p className="text-xs text-muted-foreground/50 text-center py-3">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
