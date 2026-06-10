"use client";

import { MoneyDisplay } from "@/components/shared/money-display";
import { InlinePriceEdit } from "./inline-price-edit";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { t, type Language } from "@/lib/translations";

export interface HoldingItem {
  asset: {
    id: string;
    ticker: string | null;
    name: string;
    type: string;
    currency: string;
  };
  quantity: number;
  avgCostLocal: number;
  latestPrice: number;
  priceDate: Date | string;
  priceSource: "asset_price" | "last_trade";
  priceIsStale: boolean;
  fxRateMissing: boolean;
  valueEurCents: number;
  costEurCents: number;
  unrealizedGainEurCents: number;
  returnPct: number | null;
  warnings: string[];
}

function formatNative(value: number, currency: string, locale?: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

function formatQuantity(qty: number, locale?: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 8 }).format(qty);
}

export function HoldingsTable({
  holdings,
  onSetPrice,
  lang,
  locale,
}: {
  holdings: HoldingItem[];
  onSetPrice: (assetId: string, price: number) => void;
  lang: Language;
  locale?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="py-2 px-2 text-left font-medium">{t(lang, "portfolio.asset")}</th>
            <th className="py-2 px-2 text-right font-medium">{t(lang, "portfolio.quantity")}</th>
            <th className="py-2 px-2 text-right font-medium hidden md:table-cell">{t(lang, "portfolio.avgCost")}</th>
            <th className="py-2 px-2 text-right font-medium">{t(lang, "portfolio.latestPrice")}</th>
            <th className="py-2 px-2 text-right font-medium">{t(lang, "portfolio.value")}</th>
            <th className="py-2 px-2 text-right font-medium">{t(lang, "portfolio.gain")}</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.asset.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
              {/* Asset */}
              <td className="py-2 px-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {h.asset.ticker || h.asset.name}
                      {(h.fxRateMissing || h.warnings.length > 0) && (
                        <span
                          title={
                            h.fxRateMissing
                              ? t(lang, "portfolio.missingRate").replace("{currency}", h.asset.currency)
                              : h.warnings.join(", ")
                          }
                        >
                          <AlertTriangle className="h-3 w-3 inline-block ml-1 text-amber-500" />
                        </span>
                      )}
                    </p>
                    {h.asset.ticker && (
                      <p className="text-xs text-muted-foreground truncate">{h.asset.name}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="ml-auto shrink-0 text-[10px] px-1.5 py-0">
                    {h.asset.type}
                  </Badge>
                </div>
              </td>

              {/* Quantity — Decimal, never money-formatted */}
              <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">
                {formatQuantity(h.quantity, locale)}
              </td>

              {/* Avg cost (native currency) */}
              <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap hidden md:table-cell text-muted-foreground">
                {formatNative(h.avgCostLocal, h.asset.currency, locale)}
              </td>

              {/* Latest price — inline editable */}
              <td className="py-2 px-2 text-right whitespace-nowrap">
                <div className="flex flex-col items-end">
                  <InlinePriceEdit
                    value={h.latestPrice}
                    display={formatNative(h.latestPrice, h.asset.currency, locale)}
                    onSave={(price) => onSetPrice(h.asset.id, price)}
                  />
                  {h.priceSource === "last_trade" ? (
                    <span className="text-[10px] text-muted-foreground/60">
                      {t(lang, "portfolio.lastTrade")}
                    </span>
                  ) : h.priceIsStale ? (
                    <span className="text-[10px] text-amber-500 flex items-center gap-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 inline-block" />
                      {new Date(h.priceDate).toLocaleDateString(locale)}
                    </span>
                  ) : null}
                </div>
              </td>

              {/* Value EUR */}
              <td className="py-2 px-2 text-right whitespace-nowrap">
                <MoneyDisplay amount={h.valueEurCents} colorize={false} className="font-medium" />
              </td>

              {/* Gain EUR + % */}
              <td className="py-2 px-2 text-right whitespace-nowrap">
                <MoneyDisplay
                  amount={h.unrealizedGainEurCents}
                  showSign
                  className={cn(
                    "font-medium",
                    h.unrealizedGainEurCents > 0 && "text-green-600 dark:text-green-400",
                    h.unrealizedGainEurCents < 0 && "text-red-600 dark:text-red-400"
                  )}
                  colorize={false}
                />
                {h.returnPct != null && (
                  <p
                    className={cn(
                      "text-[10px]",
                      h.unrealizedGainEurCents > 0 && "text-green-600 dark:text-green-400",
                      h.unrealizedGainEurCents < 0 && "text-red-600 dark:text-red-400",
                      h.unrealizedGainEurCents === 0 && "text-muted-foreground"
                    )}
                  >
                    {h.returnPct > 0 ? "+" : ""}
                    {(h.returnPct * 100).toFixed(1)}%
                  </p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
