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
  /** Which sidebar group this type belongs to */
  sidebarGroup: SidebarGroupKey;
}

export const ACCOUNT_TYPE_META: Record<string, AccountTypeMeta> = {
  // Spending — accounts you spend from
  CHECKING:    { label: "Checking",    icon: Landmark,   isLiability: false, groupOrder: 0, sidebarGroup: "SPENDING" },
  SAVINGS:     { label: "Savings",     icon: PiggyBank,  isLiability: false, groupOrder: 1, sidebarGroup: "SPENDING" },
  CREDIT_CARD: { label: "Credit Card", icon: CreditCard, isLiability: true,  groupOrder: 2, sidebarGroup: "SPENDING" },
  CASH:        { label: "Cash",        icon: Banknote,   isLiability: false, groupOrder: 3, sidebarGroup: "SPENDING" },
  // Investment — monthly contributions, wealth building
  INVESTMENT:  { label: "Investment",  icon: TrendingUp, isLiability: false, groupOrder: 4, sidebarGroup: "INVESTMENT" },
  CRYPTO:      { label: "Crypto",      icon: Bitcoin,    isLiability: false, groupOrder: 5, sidebarGroup: "INVESTMENT" },
  // Assets & Debts — net worth tracking only
  PROPERTY:    { label: "Property",    icon: Home,       isLiability: false, groupOrder: 6, sidebarGroup: "ASSETS_DEBTS" },
  VEHICLE:     { label: "Vehicle",     icon: Car,        isLiability: false, groupOrder: 7, sidebarGroup: "ASSETS_DEBTS" },
  OTHER_ASSET: { label: "Other Asset", icon: Package,    isLiability: false, groupOrder: 8, sidebarGroup: "ASSETS_DEBTS" },
  LOAN:        { label: "Loan",        icon: Landmark,   isLiability: true,  groupOrder: 9, sidebarGroup: "ASSETS_DEBTS" },
  MORTGAGE:    { label: "Mortgage",    icon: Building,   isLiability: true,  groupOrder: 10, sidebarGroup: "ASSETS_DEBTS" },
  OTHER_DEBT:  { label: "Other Debt",  icon: Receipt,    isLiability: true,  groupOrder: 11, sidebarGroup: "ASSETS_DEBTS" },
};

// ── Sidebar grouping ──────────────────────────────────────────────

export const SIDEBAR_GROUPS = [
  { key: "SPENDING" as const, label: "Spending", order: 0 },
  { key: "INVESTMENT" as const, label: "Investment", order: 1 },
  { key: "ASSETS_DEBTS" as const, label: "Assets & Debts", order: 2 },
] as const;

export type SidebarGroupKey = "SPENDING" | "INVESTMENT" | "ASSETS_DEBTS";

/**
 * Account types that represent spending accounts (bank accounts you transact from).
 * Used to filter tracker/recurring queries — investment and asset/debt accounts
 * are excluded from income/expense budgeting.
 */
export const SPENDING_ACCOUNT_TYPES = (Object.entries(ACCOUNT_TYPE_META)
  .filter(([, meta]) => meta.sidebarGroup === "SPENDING")
  .map(([key]) => key)) as Array<"CHECKING" | "SAVINGS" | "CREDIT_CARD" | "CASH">;

/** Account types that represent investment accounts. */
export const INVESTMENT_ACCOUNT_TYPES = (Object.entries(ACCOUNT_TYPE_META)
  .filter(([, meta]) => meta.sidebarGroup === "INVESTMENT")
  .map(([key]) => key)) as Array<"INVESTMENT" | "CRYPTO">;

/**
 * Group an array of accounts into sidebar groups,
 * sorted by groupOrder within each group.
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
