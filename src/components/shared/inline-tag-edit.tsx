"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  color?: string | null;
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
  const containerRef = useRef<HTMLDivElement>(null);

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
        // Save if changed
        if (
          localIds.length !== selectedTagIds.length ||
          localIds.some((id) => !selectedTagIds.includes(id))
        ) {
          onSave(localIds);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, localIds, selectedTagIds, onSave]);

  const toggleTag = (tagId: string) => {
    setLocalIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const selectedTags = allTags.filter((t) => selectedTagIds.includes(t.id));

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
        <div className="absolute z-50 top-full left-0 mt-1 bg-popover border border-border rounded-md shadow-lg p-2 min-w-[160px] max-h-[200px] overflow-y-auto">
          {allTags.map((tag) => {
            const isSelected = localIds.includes(tag.id);
            return (
              <label
                key={tag.id}
                className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleTag(tag.id)}
                  className="rounded border-border"
                />
                {tag.name}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
