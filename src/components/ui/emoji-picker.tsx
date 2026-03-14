"use client";

import { useState, useRef, useEffect } from "react";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

interface EmojiPickerButtonProps {
  value: string;
  onChange: (emoji: string) => void;
  className?: string;
}

export function EmojiPickerButton({ value, onChange, className }: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          className ??
          "w-8 h-6 text-center text-sm border-b border-primary/50 hover:bg-muted/50 rounded-sm transition-colors leading-none"
        }
        title="Pick an emoji"
      >
        {value || "🏷"}
      </button>

      {open && (
        <div className="absolute z-50 top-8 left-0 shadow-xl rounded-xl overflow-hidden">
          <Picker
            data={data}
            onEmojiSelect={(emoji: { native: string }) => {
              onChange(emoji.native);
              setOpen(false);
            }}
            theme="dark"
            previewPosition="none"
            skinTonePosition="none"
            maxFrequentRows={2}
          />
        </div>
      )}
    </div>
  );
}
