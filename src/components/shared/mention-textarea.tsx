"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface Member {
  id: string;
  name: string;
  image: string | null;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  members?: Member[];
  className?: string;
  placeholder?: string;
  rows?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export function MentionTextarea({
  value,
  onChange,
  members = [],
  className,
  placeholder,
  rows = 4,
  onKeyDown,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(query.toLowerCase())
  );

  // Detect @ trigger on input
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursor = e.target.selectionStart ?? newValue.length;
      onChange(newValue);

      // Find the last @ before the cursor (not preceded by a word character)
      const textUpToCursor = newValue.slice(0, cursor);
      const atMatch = textUpToCursor.match(/(?:^|[\s\n])@(\w*)$/);

      if (atMatch) {
        const atIndex = textUpToCursor.lastIndexOf("@");
        setMentionStart(atIndex);
        setQuery(atMatch[1]);
        setActiveIndex(0);
        setShowDropdown(true);
        // Position dropdown below textarea
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setDropdownPos({ top: rect.bottom + 4, left: rect.left });
        }
      } else {
        setShowDropdown(false);
        setMentionStart(-1);
        setQuery("");
      }
    },
    [onChange]
  );

  const insertMention = useCallback(
    (member: Member) => {
      if (mentionStart === -1 || !textareaRef.current) return;
      const cursor = textareaRef.current.selectionStart ?? value.length;
      const before = value.slice(0, mentionStart);
      const after = value.slice(cursor);
      const insertion = `@[${member.name}](${member.id})`;
      const newValue = `${before}${insertion}${after}`;
      onChange(newValue);
      setShowDropdown(false);
      setMentionStart(-1);
      setQuery("");

      // Restore focus and position cursor after the inserted mention
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const pos = mentionStart + insertion.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(pos, pos);
        }
      });
    },
    [mentionStart, value, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showDropdown && filteredMembers.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % filteredMembers.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIndex((i) => (i - 1 + filteredMembers.length) % filteredMembers.length);
          return;
        }
        if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          insertMention(filteredMembers[activeIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowDropdown(false);
          return;
        }
      }
      onKeyDown?.(e);
    },
    [showDropdown, filteredMembers, activeIndex, insertMention, onKeyDown]
  );

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (
        textareaRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  return (
    <div ref={containerRef} className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full text-xs rounded border border-input bg-background px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring resize-none",
          className
        )}
        placeholder={placeholder}
        rows={rows}
      />
      {showDropdown && filteredMembers.length > 0 && (
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
          className="rounded-lg border bg-popover shadow-lg max-w-[200px] py-1 overflow-hidden"
        >
          {filteredMembers.map((member, i) => (
            <button
              key={member.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(member);
              }}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors",
                i === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {member.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.image}
                  alt={member.name}
                  className="h-5 w-5 rounded-full shrink-0 object-cover"
                />
              ) : (
                <span className="h-5 w-5 rounded-full shrink-0 bg-muted flex items-center justify-center text-[10px] font-medium uppercase">
                  {member.name.charAt(0)}
                </span>
              )}
              <span className="truncate">{member.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
