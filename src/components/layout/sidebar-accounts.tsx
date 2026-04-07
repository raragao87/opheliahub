"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOwnership } from "@/lib/ownership-context";
import { cn } from "@/lib/utils";
import { MoneyDisplay } from "@/components/shared/money-display";
import { groupAccountsForSidebar, ACCOUNT_TYPE_META } from "@/lib/account-types";
import type { SidebarGroupKey } from "@/lib/account-types";
import { fromCents, parseToCents } from "@/lib/money";
import { ChevronDown, ChevronRight, Plus, Upload } from "lucide-react";
import { useUserPreferences } from "@/lib/user-preferences-context";
import { t } from "@/lib/translations";
import { useImportDrop } from "@/lib/import-drop-context";

// ── Types ─────────────────────────────────────────────────────────

interface SidebarItem {
  id: string;
  name: string;
  type: string;
  balance: number; // cents
  currency: string;
  href: string;
}

interface SidebarGroup {
  key: SidebarGroupKey;
  label: string;
  items: SidebarItem[];
  totalBalance: number;
  href: string;
}

/** Check if a drag event carries files (works with both DOMStringList and string[]) */
function hasFileDrag(e: DragEvent | React.DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  // DOMStringList (native events) has .contains(), Array (React synthetic) has .includes()
  if ("contains" in types && typeof types.contains === "function") {
    return types.contains("Files");
  }
  return Array.from(types).includes("Files");
}

// ── Component ─────────────────────────────────────────────────────

interface SidebarAccountsProps {
  /** Called after a link is clicked — used in mobile menu to close the overlay */
  onNavigate?: () => void;
}

export function SidebarAccounts({ onNavigate }: SidebarAccountsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { isVisible, visibility } = useOwnership();
  const { preferences } = useUserPreferences();
  const lang = preferences.language;

  // Detect which account(s) are active from the URL
  const isOnTransactions = pathname === "/transactions";
  const activeAccountId = isOnTransactions
    ? searchParams.get("accountId")
    : null;
  const activeAccountIds = isOnTransactions
    ? new Set((searchParams.get("accountIds") ?? "").split(",").filter(Boolean))
    : new Set<string>();

  // Fetch all accounts (including migrated assets/debts)
  const accountsQuery = useQuery(trpc.account.list.queryOptions());
  const allAccounts = accountsQuery.data ?? [];

  // Fetch per-account pending Ophelia counts (poll every 30s)
  const pendingByAccountQuery = useQuery({
    ...trpc.ophelia.pendingByAccount.queryOptions({ visibility }),
    refetchInterval: 30_000,
  });
  const pendingByAccount = pendingByAccountQuery.data?.byAccount ?? {};

  // Fetch per-account pending duplicate alert counts (poll every 30s)
  const duplicatesByAccountQuery = useQuery({
    ...trpc.duplicates.pendingByAccount.queryOptions({ visibility }),
    refetchInterval: 30_000,
  });
  const duplicatesByAccount = duplicatesByAccountQuery.data?.byAccount ?? {};

  const visibleAccounts = allAccounts.filter(
    (a) =>
      a.isActive &&
      isVisible(a.ownership as "SHARED" | "PERSONAL")
  );

  // Build unified sidebar groups
  const sidebarGroups = useMemo(() => {
    const accountGroups = groupAccountsForSidebar(visibleAccounts);

    return accountGroups.map((ag) => {
      const items: SidebarItem[] = ag.accounts.map((a) => {
        const acct = a as (typeof allAccounts)[number];
        return {
          id: acct.id,
          name: acct.name,
          type: acct.type,
          balance: acct.balance,
          currency: acct.currency,
          href: `/transactions?accountId=${acct.id}`,
        };
      });

      const groupAccountIds = items.map((i) => i.id).join(",");
      const labelKey = ag.key === "LIQUID" ? "sidebar.liquid" : "sidebar.illiquid";
      return {
        key: ag.key,
        label: t(lang, labelKey),
        items,
        totalBalance: items.reduce((s, i) => s + i.balance, 0),
        href: items.length > 0 ? `/transactions?accountIds=${groupAccountIds}` : "/transactions",
      } satisfies SidebarGroup;
    });
  }, [visibleAccounts, allAccounts, lang]);

  // Collapse state per group (all start expanded)
  const [collapsed, setCollapsed] = useState<
    Record<SidebarGroupKey, boolean>
  >({
    LIQUID: false,
    ILLIQUID: false,
  });

  const toggleGroup = (key: SidebarGroupKey) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Inline balance editing (for ILLIQUID group) ────────

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  const reconcileMutation = useMutation(
    trpc.account.reconcile.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setEditingItemId(null);
        setEditValue("");
      },
    })
  );

  // Focus the input when editing starts
  useEffect(() => {
    if (editingItemId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingItemId]);

  const startEditing = (item: SidebarItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingItemId(item.id);
    setEditValue(fromCents(Math.abs(item.balance)).toFixed(2));
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, item: SidebarItem) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const cents = parseToCents(editValue);
      if (cents == null) {
        setEditingItemId(null);
        return;
      }
      // For liability account types, store as negative
      const isLiability = ACCOUNT_TYPE_META[item.type]?.isLiability ?? false;
      const newBalance = isLiability ? -Math.abs(cents) : cents;
      reconcileMutation.mutate({ id: item.id, newBalance });
    } else if (e.key === "Escape") {
      setEditingItemId(null);
      setEditValue("");
    }
  };

  const handleEditBlur = () => {
    setEditingItemId(null);
    setEditValue("");
  };

  const isEditable = (groupKey: SidebarGroupKey) =>
    groupKey === "ILLIQUID";

  // ── Drag-and-drop import ──────────────────────────────────
  const { setPendingImport } = useImportDrop();
  const [dragOverAccountId, setDragOverAccountId] = useState<string | null>(null);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const dragCounterRef = useRef(0);
  const dragCounterByAccount = useRef(new Map<string, number>());

  // Global file-drag detection + prevent browser default file-open behavior
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (hasFileDrag(e)) {
        dragCounterRef.current++;
        setIsFileDragActive(true);
      }
    };
    const handleDragLeave = () => {
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        dragCounterByAccount.current.clear();
        setIsFileDragActive(false);
        setDragOverAccountId(null);
      }
    };
    const handleDrop = (e: DragEvent) => {
      // ALWAYS prevent default — Safari needs this to not open files.
      e.preventDefault();
      dragCounterRef.current = 0;
      dragCounterByAccount.current.clear();
      setIsFileDragActive(false);
      setDragOverAccountId(null);
    };
    // ALWAYS prevent default on dragover — required for drop events to fire in Safari.
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    document.addEventListener("dragenter", handleDragEnter);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);
    return () => {
      document.removeEventListener("dragenter", handleDragEnter);
      document.removeEventListener("dragleave", handleDragLeave);
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);
    };
  }, []);

  const handleAccountDrop = useCallback((e: React.DragEvent, item: SidebarItem) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverAccountId(null);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setPendingImport({
      accountId: item.id,
      accountName: item.name,
      file,
    });
    router.push("/transactions/import");
    onNavigate?.();
  }, [setPendingImport, router, onNavigate]);

  /** Only LIQUID accounts (checking, savings, credit card, cash) are drop targets */
  const isDroppable = (groupKey: SidebarGroupKey) => groupKey === "LIQUID";

  const isLoading = accountsQuery.isLoading;
  const totalPending = Object.values(pendingByAccount).reduce((sum, n) => sum + n, 0);
  const totalDuplicates = Object.values(duplicatesByAccount).reduce((sum, n) => sum + n, 0);

  return (
    <div className="mt-2">
      {/* Section header with add account button */}
      <div className="flex items-center justify-between px-3 mb-1">
        <div className="flex items-center gap-1.5">
          <Link
            href="/transactions"
            onClick={onNavigate}
            className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
          >
            {t(lang, "nav.accounts")}
          </Link>
          {totalPending > 0 && (
            <span className="rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-400 text-[9px] font-semibold px-1.5 py-0.5 tabular-nums leading-none">
              {totalPending}
            </span>
          )}
          {totalDuplicates > 0 && (
            <span className="rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 text-[9px] font-semibold px-1.5 py-0.5 tabular-nums leading-none">
              {totalDuplicates}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/transactions/import"
            onClick={onNavigate}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Import transactions"
          >
            <Upload className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/accounts/new"
            onClick={onNavigate}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Add account"
          >
            <Plus className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="px-3 py-2 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 bg-muted rounded animate-pulse" />
          ))}
        </div>
      )}

      {/* Global drag hint */}
      {isFileDragActive && (
        <div className="mx-3 mb-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-1.5 text-center">
          <p className="text-[11px] text-primary/70 font-medium">
            {t(lang, "sidebar.dropToImport")}
          </p>
        </div>
      )}

      {/* Account groups */}
      {sidebarGroups.map((group) => {
        const isGroupCollapsed = collapsed[group.key];

        const isGroupActive =
          isOnTransactions &&
          group.items.length > 0 &&
          group.items.every((i) => activeAccountIds.has(i.id)) &&
          activeAccountIds.size === group.items.length;

        return (
          <div key={group.key} className="mt-2">
            {/* Group header — chevron toggles collapse, label navigates */}
            <div className="flex items-center justify-between w-full px-3 py-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isGroupCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
                <Link
                  href={group.href}
                  onClick={onNavigate}
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wider transition-colors hover:text-foreground",
                    isGroupActive ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {group.label}
                </Link>
              </div>
              <MoneyDisplay
                amount={group.totalBalance}
                className="text-[11px] font-medium"
                colorize={false}
              />
            </div>

            {/* Individual items */}
            {!isGroupCollapsed && (
              <div className="space-y-0.5 mt-0.5">
                {group.items.map((item) => {
                  const isActive = activeAccountId === item.id;
                  const canEdit = isEditable(group.key);
                  const isEditingThis = editingItemId === item.id;
                  const canDrop = isDroppable(group.key);
                  const isDragTarget = dragOverAccountId === item.id;

                  const linkContent = (
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "group/account flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ml-5",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        isDragTarget && "ring-2 ring-primary ring-inset"
                      )}
                    >
                      <span className="min-w-0 flex-1 flex items-center gap-1">
                        <span className="truncate text-xs">{item.name}</span>
                        {(pendingByAccount[item.id] ?? 0) > 0 && (
                          <span className={cn(
                            "shrink-0 rounded-full text-[9px] font-semibold px-1.5 py-0.5 tabular-nums leading-none",
                            isActive
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-400"
                          )}>
                            {pendingByAccount[item.id]}
                          </span>
                        )}
                        {(duplicatesByAccount[item.id] ?? 0) > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onNavigate?.();
                              router.push(`/transactions?accountId=${item.id}&duplicates=pending`);
                            }}
                            className={cn(
                              "shrink-0 rounded-full text-[9px] font-semibold px-1.5 py-0.5 tabular-nums leading-none hover:opacity-80 transition-opacity",
                              isActive
                                ? "bg-primary-foreground/20 text-primary-foreground"
                                : "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400"
                            )}
                            title={`${duplicatesByAccount[item.id]} possible duplicate${duplicatesByAccount[item.id] !== 1 ? "s" : ""} — click to review`}
                          >
                            {duplicatesByAccount[item.id]}
                          </button>
                        )}
                        {isDragTarget && (
                          <Upload className="h-3 w-3 text-primary shrink-0 ml-auto" />
                        )}
                      </span>

                      {!isDragTarget && (
                        <>
                          {isEditingThis ? (
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => handleEditKeyDown(e, item)}
                              onBlur={handleEditBlur}
                              onClick={(e) => e.preventDefault()}
                              className="w-20 text-xs text-right bg-input text-foreground border border-border rounded px-1.5 py-0.5 font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-primary caret-foreground"
                            />
                          ) : canEdit ? (
                            <button
                              type="button"
                              onClick={(e) => startEditing(item, e)}
                              className="cursor-pointer hover:opacity-70"
                              title="Click to update balance"
                            >
                              <MoneyDisplay
                                amount={item.balance}
                                currency={item.currency}
                                className={cn(
                                  "text-xs shrink-0 ml-2",
                                  isActive && "text-primary-foreground"
                                )}
                                colorize={!isActive}
                              />
                            </button>
                          ) : (
                            <MoneyDisplay
                              amount={item.balance}
                              currency={item.currency}
                              className={cn(
                                "text-xs shrink-0 ml-2",
                                isActive && "text-primary-foreground"
                              )}
                              colorize={!isActive}
                            />
                          )}
                        </>
                      )}
                    </Link>
                  );

                  if (!canDrop) {
                    return <div key={item.id}>{linkContent}</div>;
                  }

                  return (
                    <div
                      key={item.id}
                      className="relative"
                      onDragOver={(e) => {
                        if (!hasFileDrag(e)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = "copy";
                        setDragOverAccountId(item.id);
                      }}
                      onDragEnter={(e) => {
                        if (!hasFileDrag(e)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const count = (dragCounterByAccount.current.get(item.id) ?? 0) + 1;
                        dragCounterByAccount.current.set(item.id, count);
                        if (count === 1) {
                          setDragOverAccountId(item.id);
                        }
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const count = (dragCounterByAccount.current.get(item.id) ?? 1) - 1;
                        dragCounterByAccount.current.set(item.id, Math.max(0, count));
                        if (count <= 0) {
                          setDragOverAccountId((prev) => prev === item.id ? null : prev);
                        }
                      }}
                      onDrop={(e) => {
                        dragCounterByAccount.current.set(item.id, 0);
                        handleAccountDrop(e, item);
                      }}
                    >
                      {linkContent}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

    </div>
  );
}
