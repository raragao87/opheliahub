"use client";

import { useState, useRef, useEffect } from "react";
import { formatMoney, fromCents, toCents } from "@/lib/money";
import { cn } from "@/lib/utils";

interface InlineMoneyEditProps {
  value: number; // cents
  currency?: string;
  onSave: (cents: number) => void;
  placeholder?: string;
  className?: string;
  /** Rendered to the left of the input when in edit mode */
  editingPrefix?: React.ReactNode;
}

export function InlineMoneyEdit({
  value,
  currency = "EUR",
  onSave,
  placeholder,
  className,
  editingPrefix,
}: InlineMoneyEditProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    if (!inputRef.current) return;
    const parsed = parseFloat(inputRef.current.value);
    const cents = isNaN(parsed) ? 0 : toCents(parsed);
    setEditing(false);
    onSave(cents);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  };

  if (editing) {
    const input = (
      <input
        ref={inputRef}
        type="number"
        step="0.01"
        defaultValue={value ? fromCents(value).toFixed(2) : ""}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full bg-transparent border-0 border-b border-primary/50 outline-none text-right font-mono tabular-nums text-sm py-0 px-1 rounded-none",
          className
        )}
      />
    );
    if (editingPrefix) {
      return (
        <div className="flex items-center gap-1">
          {editingPrefix}
          {input}
        </div>
      );
    }
    return input;
  }

  const isZero = value === 0;
  const formatted = formatMoney(Math.abs(value), currency);
  const display = value < 0 ? `-${formatted}` : formatted;

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn(
        "font-mono tabular-nums text-right text-sm cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-muted/50",
        isZero && "text-muted-foreground/50",
        className
      )}
    >
      {isZero ? (placeholder ?? formatted) : display}
    </span>
  );
}
