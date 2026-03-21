"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface InlineDateEditProps {
  value: Date | string;
  onSave: (date: Date) => void;
  className?: string;
}

function toDateString(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

function formatShortDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export function InlineDateEdit({
  value,
  onSave,
  className,
}: InlineDateEditProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.showPicker?.();
    }
  }, [editing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      const newDate = new Date(val + "T12:00:00");
      setEditing(false);
      if (toDateString(newDate) !== toDateString(value)) {
        onSave(newDate);
      }
    }
  };

  const handleBlur = () => {
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        defaultValue={toDateString(value)}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          "bg-transparent border-0 border-b border-primary/50 outline-none text-sm py-0 px-1 rounded-none",
          className
        )}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn(
        "text-sm text-muted-foreground cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-muted/50 whitespace-nowrap",
        className
      )}
    >
      {formatShortDate(value)}
    </span>
  );
}
