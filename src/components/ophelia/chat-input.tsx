"use client";

import { useState, useRef, useEffect } from "react";
import { SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  inputValue?: string;
  onInputChange?: (value: string) => void;
}

export function ChatInput({ onSend, disabled, inputValue, onInputChange }: ChatInputProps) {
  const [localValue, setLocalValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const value = inputValue ?? localValue;
  const setValue = onInputChange ?? setLocalValue;

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="flex items-center gap-2 border-t px-3 py-2">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder="Ask Ophelia anything..."
        disabled={disabled}
        className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50 disabled:opacity-50"
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className={cn(
          "flex items-center justify-center h-7 w-7 rounded-md transition-colors",
          value.trim() && !disabled
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "text-muted-foreground/30"
        )}
      >
        <SendHorizontal className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
