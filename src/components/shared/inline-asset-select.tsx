"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface AssetOption {
  id: string;
  ticker: string | null;
  name: string;
  type: string;
}

interface InlineAssetSelectProps {
  value: string | null;
  displayText?: string | null;
  assets: AssetOption[];
  onChange: (assetId: string | null) => void;
  disabled?: boolean;
  className?: string;
}

const TYPE_LABELS: Record<string, string> = {
  STOCK: "Stock",
  ETF: "ETF",
  BOND: "Bond",
  CRYPTO: "Crypto",
  COMMODITY: "Commodity",
  FUND: "Fund",
  OTHER: "Other",
};

export function InlineAssetSelect({
  value,
  displayText,
  assets,
  onChange,
  disabled,
  className,
}: InlineAssetSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  const lowerSearch = search.toLowerCase();
  const filtered = assets.filter(
    (a) =>
      a.name.toLowerCase().includes(lowerSearch) ||
      (a.ticker && a.ticker.toLowerCase().includes(lowerSearch))
  );

  const display = displayText || "—";

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={cn(
          "text-[10px] font-medium px-1 py-0.5 rounded cursor-pointer transition-colors",
          value
            ? "text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30"
            : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50",
          disabled && "cursor-default opacity-50",
          className
        )}
      >
        {display}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-md bg-popover border shadow-lg overflow-hidden">
          <div className="p-1.5">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground/50 px-1 py-0.5"
            />
          </div>
          <div className="border-t max-h-48 overflow-y-auto">
            {/* Clear option */}
            {value && (
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 border-b"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Clear asset
              </button>
            )}

            {/* Asset list */}
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground/50 text-center">
                No assets found
              </div>
            ) : (
              filtered.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50 flex items-center gap-1.5",
                    asset.id === value && "bg-primary/10 text-primary"
                  )}
                  onClick={() => {
                    onChange(asset.id);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium shrink-0">
                    {asset.ticker ?? asset.name.substring(0, 4).toUpperCase()}
                  </span>
                  <span className="text-muted-foreground truncate">
                    {asset.name}
                  </span>
                  <span className="text-[9px] text-muted-foreground/50 shrink-0 ml-auto">
                    {TYPE_LABELS[asset.type] ?? asset.type}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
