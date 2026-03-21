"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  color?: string | null;
  group?: { id: string; name: string } | null;
}

interface InlineTagEditProps {
  selectedTagIds: string[];
  allTags: Tag[];
  onSave: (tagIds: string[]) => void;
  className?: string;
}

export function InlineTagEdit({
  selectedTagIds,
  allTags,
  onSave,
  className,
}: InlineTagEditProps) {
  const [open, setOpen] = useState(false);
  const [localIds, setLocalIds] = useState<string[]>(selectedTagIds);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Sync local state when props change
  useEffect(() => {
    setLocalIds(selectedTagIds);
  }, [selectedTagIds]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const toggleTag = (tagId: string) => {
    const next = localIds.includes(tagId)
      ? localIds.filter((id) => id !== tagId)
      : [...localIds, tagId];
    setLocalIds(next);
    onSave(next);
  };

  const selectedTags = allTags.filter((t) => localIds.includes(t.id));

  // Group tags for the dropdown
  const tagGroups = useMemo(() => {
    const grouped = new Map<string, { label: string; tags: Tag[] }>();
    for (const tag of allTags) {
      const key = tag.group?.name ?? "__ungrouped__";
      if (!grouped.has(key)) {
        grouped.set(key, { label: tag.group?.name ?? "Tags", tags: [] });
      }
      grouped.get(key)!.tags.push(tag);
    }
    return Array.from(grouped.values());
  }, [allTags]);

  const hasGroups = tagGroups.length > 1;

  const filtered = search
    ? tagGroups
        .map((g) => ({ ...g, tags: g.tags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase())) }))
        .filter((g) => g.tags.length > 0)
    : tagGroups;

  // Focus search when opened
  useEffect(() => {
    if (open) { setSearch(""); setTimeout(() => searchRef.current?.focus(), 0); }
  }, [open]);

  if (allTags.length === 0) {
    return <span className="text-xs text-muted-foreground/40">—</span>;
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        onClick={() => setOpen(!open)}
        className="flex flex-wrap gap-0.5 cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-muted/50 min-h-[24px] items-center"
      >
        {selectedTags.length > 0 ? (
          selectedTags.map((tag) => (
            <Badge key={tag.id} variant="outline" className="text-xs py-0">
              {tag.name}
            </Badge>
          ))
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-popover border border-border rounded-md shadow-lg min-w-[180px] max-h-[280px] flex flex-col">
          <div className="p-2 border-b border-border shrink-0">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="p-1.5 space-y-0.5 overflow-y-auto flex-1">
            {filtered.map((group, gi) => (
              <div key={gi} className={gi > 0 && hasGroups ? "mt-1 pt-1 border-t border-border/40" : ""}>
                {hasGroups && (
                  <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider px-2 py-1">
                    {group.label}
                  </p>
                )}
                {group.tags.map((tag) => {
                  const isSelected = localIds.includes(tag.id);
                  return (
                    <label
                      key={tag.id}
                      className={cn(
                        "flex items-center gap-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm",
                        hasGroups ? "pl-4 pr-2" : "px-2"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTag(tag.id)}
                        className="rounded border-border shrink-0"
                      />
                      <span className="truncate">{tag.name}</span>
                    </label>
                  );
                })}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground/50 text-center py-3">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
