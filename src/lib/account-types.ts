import {
  Landmark,
  PiggyBank,
  CreditCard,
  TrendingUp,
  Banknote,
  Bitcoin,
  Home,
  Car,
  Package,
  Building,
  Receipt,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Account type metadata ─────────────────────────────────────────

export interface AccountTypeMeta {
  label: string;
  icon: LucideIcon;
  isLiability: boolean;
  groupOrder: number;
  /** Which YNAB-style sidebar group this type belongs to */
  sidebarGroup: SidebarGroupKey;
}

export const ACCOUNT_TYPE_META: Record<string, AccountTypeMeta> = {
  // Liquid — bank accounts you can spend from
  CHECKING: { label: "Checking", icon: Landmark, isLiability: false, groupOrder: 0, sidebarGroup: "LIQUID" },
  SAVINGS: { label: "Savings", icon: PiggyBank, isLiability: false, groupOrder: 1, sidebarGroup: "LIQUID" },
  CREDIT_CARD: { label: "Credit Card", icon: CreditCard, isLiability: true, groupOrder: 2, sidebarGroup: "LIQUID" },
  CASH: { label: "Cash", icon: Banknote, isLiability: false, groupOrder: 3, sidebarGroup: "LIQUID" },
  // Illiquid — assets, loans, and long-term holdings
  INVESTMENT: { label: "Investment", icon: TrendingUp, isLiability: false, groupOrder: 4, sidebarGroup: "ILLIQUID" },
  CRYPTO: { label: "Crypto", icon: Bitcoin, isLiability: false, groupOrder: 5, sidebarGroup: "ILLIQUID" },
  PROPERTY: { label: "Property", icon: Home, isLiability: false, groupOrder: 6, sidebarGroup: "ILLIQUID" },
  VEHICLE: { label: "Vehicle", icon: Car, isLiability: false, groupOrder: 7, sidebarGroup: "ILLIQUID" },
  OTHER_ASSET: { label: "Other Asset", icon: Package, isLiability: false, groupOrder: 8, sidebarGroup: "ILLIQUID" },
  LOAN: { label: "Loan", icon: Landmark, isLiability: true, groupOrder: 9, sidebarGroup: "ILLIQUID" },
  MORTGAGE: { label: "Mortgage", icon: Building, isLiability: true, groupOrder: 10, sidebarGroup: "ILLIQUID" },
  OTHER_DEBT: { label: "Other Debt", icon: Receipt, isLiability: true, groupOrder: 11, sidebarGroup: "ILLIQUID" },
};

// ── Sidebar grouping ──────────────────────────────────────────────

export const SIDEBAR_GROUPS = [
  { key: "LIQUID" as const, label: "Liquid", order: 0 },
  { key: "ILLIQUID" as const, label: "Illiquid", order: 1 },
] as const;

export type SidebarGroupKey = "LIQUID" | "ILLIQUID";

/**
 * Account types that represent liquid accounts (bank accounts you can spend from).
 * Used to filter tracker/recurring queries — illiquid accounts (investments,
 * property, vehicles, loans) are excluded from budgeting.
 */
export const LIQUID_ACCOUNT_TYPES = (Object.entries(ACCOUNT_TYPE_META)
  .filter(([, meta]) => meta.sidebarGroup === "LIQUID")
  .map(([key]) => key)) as Array<"CHECKING" | "SAVINGS" | "CREDIT_CARD" | "CASH">;

/**
 * Group an array of accounts into sidebar groups by liquidity
 * (Liquid / Illiquid), sorted by groupOrder within each group.
 * Only includes active accounts.
 */
export function groupAccountsForSidebar<
  T extends { type: string; isActive: boolean }
>(accounts: T[]): { key: SidebarGroupKey; label: string; accounts: T[] }[] {
  const grouped = new Map<SidebarGroupKey, T[]>();

  for (const group of SIDEBAR_GROUPS) {
    grouped.set(group.key, []);
  }

  for (const account of accounts) {
    if (!account.isActive) continue;
    const meta = ACCOUNT_TYPE_META[account.type];
    if (!meta) continue;
    grouped.get(meta.sidebarGroup)!.push(account);
  }

  // Sort accounts within each group by groupOrder, then name
  for (const [, accts] of grouped) {
    accts.sort((a, b) => {
      const aOrder = ACCOUNT_TYPE_META[a.type]?.groupOrder ?? 99;
      const bOrder = ACCOUNT_TYPE_META[b.type]?.groupOrder ?? 99;
      return aOrder - bOrder;
    });
  }

  return SIDEBAR_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    accounts: grouped.get(g.key)!,
  })).filter((g) => g.accounts.length > 0);
}
