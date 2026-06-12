"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SelectableCard — the Hermes-style option card.
 *
 * Layout (matches the screenshot):
 *
 *   ┌────────────────────────────────────────┐
 *   │ [Icon]  Title                [✓]      │
 *   │          One-line description           │
 *   └────────────────────────────────────────┘
 *
 * Use inside a grid container. `flex-1` lets cards stretch in a row.
 *
 * Variants:
 *   - "default" — sits in a 1- or 2-column grid (Language, Theme palette)
 *   - "wide"    — for "row of N" layouts (Color Mode: 3 across, etc.)
 */
export interface SelectableCardProps {
  selected: boolean;
  onSelect: () => void;
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** Optional badge in the top-right (e.g. "Luminous", "EN") */
  badge?: string;
  /** Disabled state — cards are still visible but can't be clicked */
  disabled?: boolean;
  /** Optional className for the outer button */
  className?: string;
  /** Accessible label override; defaults to title */
  ariaLabel?: string;
}

export function SelectableCard({
  selected,
  onSelect,
  icon,
  title,
  description,
  badge,
  disabled,
  className,
  ariaLabel,
}: SelectableCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel ?? title}
      disabled={disabled}
      onClick={() => !disabled && onSelect()}
      className={cn(
        // Base layout — matches Hermes: card, 1rem padding, rounded, border, full text-left
        "group relative flex flex-col gap-2 rounded-lg border p-4 text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        // Selected state: primary-colored background tint + primary border
        selected
          ? "border-primary/40 bg-primary/[0.04] dark:bg-primary/[0.08]"
          : "border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/50",
        // Disabled: dimmed, no hover
        disabled && "opacity-50 cursor-not-allowed hover:border-border hover:bg-card",
        className
      )}
    >
      {/* Top row: icon + (badge on the right) + checkmark when selected */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <div
              className={cn(
                "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border",
                selected
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-muted text-muted-foreground"
              )}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-foreground truncate">
                {title}
              </span>
              {badge && !selected && (
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {badge}
                </span>
              )}
            </div>
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Checkmark — only when selected, mirrors Hermes top-right blue dot */}
        {selected && (
          <div
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
            aria-hidden
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * Helper to render a responsive grid of SelectableCards.
 * - 1 column on mobile
 * - `cols` columns on md+ (defaults to 3 to match the Color Mode row in the screenshot)
 */
export function SelectableCardGrid({
  children,
  cols = 3,
  className,
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "grid grid-cols-1 gap-3",
        cols === 2 && "md:grid-cols-2",
        cols === 3 && "md:grid-cols-3",
        cols === 4 && "md:grid-cols-2 lg:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}
