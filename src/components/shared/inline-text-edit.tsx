"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface InlineTextEditProps {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  className?: string;
  maxLength?: number;
}

export function InlineTextEdit({
  value,
  onSave,
  placeholder = "—",
  className,
  maxLength,
}: InlineTextEditProps) {
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
    const trimmed = inputRef.current.value.trim();
    setEditing(false);
    if (trimmed !== value) {
      onSave(trimmed);
    }
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
    return (
      <input
        ref={inputRef}
        type="text"
        defaultValue={value}
        maxLength={maxLength}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full bg-transparent border-0 border-b border-primary/50 outline-none text-sm py-0 px-1 rounded-none",
          className
        )}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn(
        "text-sm cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-muted/50 truncate block",
        !value && "text-muted-foreground/50",
        className
      )}
    >
      {value || placeholder}
    </span>
  );
}
