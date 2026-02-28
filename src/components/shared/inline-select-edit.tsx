"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface InlineSelectOption {
  value: string;
  label: string;
}

interface InlineSelectEditProps {
  value: string;
  displayValue: string;
  options: InlineSelectOption[];
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
  onSave,
  placeholder = "—",
  className,
  allowEmpty = true,
  emptyLabel = "None",
}: InlineSelectEditProps) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && selectRef.current) {
      selectRef.current.focus();
      // Try to open the dropdown automatically
      selectRef.current.click();
    }
  }, [editing]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setEditing(false);
    if (newValue !== value) {
      onSave(newValue);
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
      <select
        ref={selectRef}
        defaultValue={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          "bg-transparent border-0 border-b border-primary/50 outline-none text-sm py-0 px-0 rounded-none w-full",
          className
        )}
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn(
        "text-sm cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-muted/50 truncate block",
        !displayValue && "text-muted-foreground/50",
        className
      )}
    >
      {displayValue || placeholder}
    </span>
  );
}
