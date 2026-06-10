"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface InlinePriceEditProps {
  /** Current price in the asset's native currency (decimal, up to 6 dp) */
  value: number;
  /** Formatted display string */
  display: string;
  onSave: (price: number) => void;
  className?: string;
}

/**
 * Click-to-edit decimal price input. Unlike InlineMoneyEdit this is NOT
 * cents-based — asset prices need up to 6 decimal places.
 */
export function InlinePriceEdit({ value, display, onSave, className }: InlinePriceEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(String(value));
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [editing, value]);

  const save = () => {
    setEditing(false);
    const parsed = parseFloat(draft.replace(",", "."));
    if (!isNaN(parsed) && parsed > 0 && parsed !== value) {
      onSave(parsed);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className={cn(
          "w-24 bg-transparent border border-primary/50 rounded px-1 py-0.5 text-sm text-right tabular-nums outline-none",
          className
        )}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to set today's price"
      className={cn(
        "text-sm cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-muted/50 tabular-nums whitespace-nowrap",
        className
      )}
    >
      {display}
    </span>
  );
}
