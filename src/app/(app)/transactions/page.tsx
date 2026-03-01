"use client";

import { Suspense, useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { BulkActionBar } from "@/components/transactions/bulk-action-bar";
import type { FilterOptionGroup } from "@/components/shared/multi-select-filter";
import { useOwnership } from "@/lib/ownership-context";
import { ACCOUNT_TYPE_META, SIDEBAR_GROUPS } from "@/lib/account-types";
import { toCents } from "@/lib/money";
import { toast } from "sonner";
import {
  Plus,
  Upload,
  X,
  Receipt,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────────────────

function parseCSV(s: string | null): string[] {
  return s ? s.split(",").filter(Boolean) : [];
}
function toCSV(arr: string[]): string {
  return arr.join(",");
}

// ── Filters shape ────────────────────────────────────────────────────

interface Filters {
  search: string;
  accountIds: string[];
  categoryIds: string[];
  tagIds: string[];
  type: string;
  transferType: string;
  dateFrom: string;
  dateTo: string;
  accrualDateFrom: string;
  accrualDateTo: string;
  visibility: string; // "" | "SHARED" | "PERSONAL"
  amountMin: string; // stored as display value (e.g. "10.00"), converted to cents for query
  amountMax: string;
  liquidOnly: string;
  uncategorized: boolean;
  noTags: boolean;
}

function filtersFromParams(sp: URLSearchParams): Filters {
  return {
    search: sp.get("search") ?? "",
    accountIds: parseCSV(sp.get("accountIds") ?? sp.get("accountId")),
    categoryIds: parseCSV(sp.get("categoryIds") ?? sp.get("categoryId")),
    tagIds: parseCSV(sp.get("tagIds")),
    type: sp.get("type") ?? "",
    transferType: sp.get("transferType") ?? "",
    dateFrom: sp.get("dateFrom") ?? "",
    dateTo: sp.get("dateTo") ?? "",
    accrualDateFrom: sp.get("accrualDateFrom") ?? "",
    accrualDateTo: sp.get("accrualDateTo") ?? "",
    visibility: sp.get("visibility") ?? "",
    amountMin: sp.get("amountMin") ?? "",
    amountMax: sp.get("amountMax") ?? "",
    liquidOnly: sp.get("liquidOnly") ?? "",
    uncategorized: sp.get("uncategorized") === "true",
    noTags: sp.get("noTags") === "true",
  };
}

function filtersToParams(f: Filters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.search) sp.set("search", f.search);
  if (f.accountIds.length) sp.set("accountIds", toCSV(f.accountIds));
  if (f.categoryIds.length) sp.set("categoryIds", toCSV(f.categoryIds));
  if (f.tagIds.length) sp.set("tagIds", toCSV(f.tagIds));
  if (f.type) sp.set("type", f.type);
  if (f.transferType) sp.set("transferType", f.transferType);
  if (f.dateFrom) sp.set("dateFrom", f.dateFrom);
  if (f.dateTo) sp.set("dateTo", f.dateTo);
  if (f.accrualDateFrom) sp.set("accrualDateFrom", f.accrualDateFrom);
  if (f.accrualDateTo) sp.set("accrualDateTo", f.accrualDateTo);
  if (f.visibility) sp.set("visibility", f.visibility);
  if (f.amountMin) sp.set("amountMin", f.amountMin);
  if (f.amountMax) sp.set("amountMax", f.amountMax);
  if (f.liquidOnly) sp.set("liquidOnly", f.liquidOnly);
  if (f.uncategorized) sp.set("uncategorized", "true");
  if (f.noTags) sp.set("noTags", "true");
  return sp;
}

function filtersEqual(a: Filters, b: Filters): boolean {
  return (
    a.search === b.search &&
    a.accountIds.join(",") === b.accountIds.join(",") &&
    a.categoryIds.join(",") === b.categoryIds.join(",") &&
    a.tagIds.join(",") === b.tagIds.join(",") &&
    a.type === b.type &&
    a.transferType === b.transferType &&
    a.dateFrom === b.dateFrom &&
    a.dateTo === b.dateTo &&
    a.accrualDateFrom === b.accrualDateFrom &&
    a.accrualDateTo === b.accrualDateTo &&
    a.visibility === b.visibility &&
    a.amountMin === b.amountMin &&
    a.amountMax === b.amountMax &&
    a.liquidOnly === b.liquidOnly &&
    a.uncategorized === b.uncategorized &&
    a.noTags === b.noTags
  );
}

const EMPTY_FILTERS: Filters = {
  search: "",
  accountIds: [],
  categoryIds: [],
  tagIds: [],
  type: "",
  transferType: "",
  dateFrom: "",
  dateTo: "",
  accrualDateFrom: "",
  accrualDateTo: "",
  visibility: "",
  amountMin: "",
  amountMax: "",
  liquidOnly: "",
  uncategorized: false,
  noTags: false,
};

// ── Page ─────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground p-8">Loading...</div>}>
      <TransactionsContent />
    </Suspense>
  );
}

function TransactionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { visibilityParam } = useOwnership();

  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(searchParams));
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Sync URL params → filter state (when URL changes externally)
  useEffect(() => {
    setFilters((prev) => {
      const next = filtersFromParams(searchParams);
      return filtersEqual(prev, next) ? prev : next;
    });
  }, [searchParams]);

  // Sync filter state → URL params (debounced)
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      const currentParams = filtersFromParams(searchParams);
      if (!filtersEqual(filters, currentParams)) {
        const newParams = filtersToParams(filters);
        const qs = newParams.toString();
        router.replace(qs ? `?${qs}` : "?", { scroll: false });
      }
    }, 300);
    return () => clearTimeout(syncTimeoutRef.current);
  }, [filters, router, searchParams]);

  // ── Convenience updaters ───────────────────────────────────────────
  const updateFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ── Data queries ───────────────────────────────────────────────────
  const accountsQuery = useQuery(trpc.account.list.queryOptions());
  const categoriesQuery = useQuery(
    trpc.category.tree.queryOptions({ visibility: visibilityParam })
  );
  const tagsQuery = useQuery(
    trpc.tag.list.queryOptions({ visibility: visibilityParam })
  );

  // ── Build query input ──────────────────────────────────────────────
  const PAGE_SIZE = 50;

  const queryInput = useMemo(() => {
    const amountMinCents = filters.amountMin ? toCents(parseFloat(filters.amountMin)) : undefined;
    const amountMaxCents = filters.amountMax ? toCents(parseFloat(filters.amountMax)) : undefined;

    return {
      search: filters.search || undefined,
      visibility: (filters.visibility as "SHARED" | "PERSONAL") || visibilityParam,
      accountIds: filters.accountIds.length ? filters.accountIds : undefined,
      categoryIds: !filters.uncategorized && filters.categoryIds.length ? filters.categoryIds : undefined,
      type: (filters.type as "INCOME" | "EXPENSE" | "TRANSFER") || undefined,
      transferType: (filters.transferType as "INTERNAL" | "EXTERNAL") || undefined,
      dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
      dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
      accrualDateFrom: filters.accrualDateFrom ? new Date(filters.accrualDateFrom) : undefined,
      accrualDateTo: filters.accrualDateTo ? new Date(filters.accrualDateTo) : undefined,
      amountMin: !isNaN(amountMinCents ?? NaN) ? amountMinCents : undefined,
      amountMax: !isNaN(amountMaxCents ?? NaN) ? amountMaxCents : undefined,
      liquidOnly: filters.liquidOnly === "true" || undefined,
      uncategorized: filters.uncategorized || undefined,
      noTags: filters.noTags || undefined,
      limit: PAGE_SIZE,
    };
  }, [filters, visibilityParam]);

  const transactionsQuery = useInfiniteQuery(
    trpc.transaction.list.infiniteQueryOptions(queryInput, {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    })
  );

  const transactions = useMemo(() => {
    const all = transactionsQuery.data?.pages.flatMap((p) => p.transactions) ?? [];
    const seen = new Set<string>();
    return all.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  }, [transactionsQuery.data]);
  const hasMore = transactionsQuery.hasNextPage;

  // ── Infinite scroll ─────────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null);
  const sentinelVisibleRef = useRef(false);

  // Track whether the sentinel is in view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        sentinelVisibleRef.current = entries[0]?.isIntersecting ?? false;
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore]); // re-create when sentinel mounts/unmounts

  // Poll: if sentinel is visible and we can load more, do it
  useEffect(() => {
    if (!hasMore) return;
    const interval = setInterval(() => {
      if (sentinelVisibleRef.current && transactionsQuery.hasNextPage && !transactionsQuery.isFetchingNextPage) {
        transactionsQuery.fetchNextPage();
      }
    }, 200);
    return () => clearInterval(interval);
  }, [hasMore, transactionsQuery.hasNextPage, transactionsQuery.isFetchingNextPage, transactionsQuery.fetchNextPage]);

  // ── Derived data (needed before mutation) ──────────────────────────

  // Flatten category tree for inline editing + filter
  const flatCategories = useMemo(() => {
    const groups = categoriesQuery.data ?? [];
    return groups.flatMap((group) =>
      group.children.map((cat) => ({
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        groupName: group.name,
      }))
    );
  }, [categoriesQuery.data]);

  // ── Inline update mutation with optimistic updates ─────────────────
  const infiniteQueryKey = trpc.transaction.list.infiniteQueryOptions(queryInput, {
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  }).queryKey;

  const updateMutation = useMutation(
    trpc.transaction.update.mutationOptions({
      onMutate: async (variables) => {
        await queryClient.cancelQueries({ queryKey: infiniteQueryKey });
        const previous = queryClient.getQueryData(infiniteQueryKey);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        queryClient.setQueryData(infiniteQueryKey, (old: any) => {
          if (!old) return old;
          return {
            ...old,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pages: old.pages.map((page: any) => ({
              ...page,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              transactions: page.transactions.map((txn: any) =>
                txn.id === variables.id
                  ? {
                      ...txn,
                      ...(variables.displayName !== undefined && { displayName: variables.displayName }),
                      ...(variables.date !== undefined && { date: variables.date }),
                      ...(variables.amount !== undefined && { amount: variables.amount }),
                      ...(variables.categoryId !== undefined && {
                        categoryId: variables.categoryId,
                        category: (() => {
                          if (!variables.categoryId) return null;
                          const cat = flatCategories.find((c) => c.id === variables.categoryId);
                          if (!cat) return txn.category;
                          return { id: cat.id, name: cat.name, icon: cat.icon ?? null, color: null };
                        })(),
                      }),
                      ...(variables.tagIds !== undefined && {
                        tags: variables.tagIds.map((tagId: string) => {
                          const tag = (tagsQuery.data ?? []).find((t) => t.id === tagId);
                          return { tag: { id: tagId, name: tag?.name ?? "", color: tag?.color ?? null } };
                        }),
                      }),
                    }
                  : txn
              ),
            })),
          };
        });

        return { previous };
      },
      onError: (_err, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(infiniteQueryKey, context.previous);
        }
      },
      onSettled: () => {
        queryClient.invalidateQueries();
      },
    })
  );

  function handleUpdate(id: string, data: Record<string, unknown>) {
    updateMutation.mutate({ id, ...data } as Parameters<typeof updateMutation.mutate>[0]);
  }

  // ── Delete mutation with optimistic removal ────────────────────────
  const deleteMutation = useMutation(
    trpc.transaction.delete.mutationOptions({
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: infiniteQueryKey });
        const previous = queryClient.getQueryData(infiniteQueryKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        queryClient.setQueryData(infiniteQueryKey, (old: any) => {
          if (!old) return old;
          return {
            ...old,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pages: old.pages.map((page: any) => ({
              ...page,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              transactions: page.transactions.filter((txn: any) => txn.id !== id),
            })),
          };
        });
        return { previous };
      },
      onError: (_err, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(infiniteQueryKey, context.previous);
        }
        toast.error("Failed to delete transaction");
      },
      onSuccess: () => {
        toast.success("Transaction deleted");
      },
      onSettled: () => {
        queryClient.invalidateQueries();
      },
    })
  );

  function handleDelete(id: string) {
    deleteMutation.mutate({ id });
  }

  // ── Fix visibility mutation ────────────────────────────────────────
  const fixVisibilityMutation = useMutation(
    trpc.transaction.fixVisibility.mutationOptions({
      onError: (err) => toast.error(err.message),
      onSettled: () => queryClient.invalidateQueries(),
    })
  );

  const handleFixVisibility = useCallback((silent = false) => {
    fixVisibilityMutation.mutate(undefined, {
      onSuccess: (data) => {
        if (silent && data.fixed === 0) return;
        toast.success(
          data.fixed === 0
            ? "All transaction visibilities are already correct"
            : `Fixed visibility on ${data.fixed} transaction${data.fixed !== 1 ? "s" : ""}`
        );
      },
    });
  }, [fixVisibilityMutation]);

  // Auto-fix on mount: silently sync visibility once per page visit
  const fixedOnMount = useRef(false);
  useEffect(() => {
    if (fixedOnMount.current) return;
    fixedOnMount.current = true;
    handleFixVisibility(true);
  }, [handleFixVisibility]);

  // ── Selection state ────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectedTransactions = useMemo(() => {
    return transactions
      .filter((t) => selectedIds.has(t.id))
      .map((t) => ({
        id: t.id,
        visibility: t.visibility,
        importBatchId: (t as Record<string, unknown>).importBatchId as string | null | undefined,
      }));
  }, [selectedIds, transactions]);

  // Bulk mutations
  const bulkCategoryMutation = useMutation(
    trpc.transaction.bulkUpdateCategory.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Updated category on ${data.updated} transaction${data.updated !== 1 ? "s" : ""}`);
        setSelectedIds(new Set());
        queryClient.invalidateQueries();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const bulkVisibilityMutation = useMutation(
    trpc.transaction.bulkUpdateVisibility.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Updated visibility on ${data.updated} transaction${data.updated !== 1 ? "s" : ""}`);
        setSelectedIds(new Set());
        queryClient.invalidateQueries();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const bulkAddTagsMutation = useMutation(
    trpc.transaction.bulkAddTags.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Added tags to ${data.updated} transaction${data.updated !== 1 ? "s" : ""}`);
        setSelectedIds(new Set());
        queryClient.invalidateQueries();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const bulkRemoveTagsMutation = useMutation(
    trpc.transaction.bulkRemoveTags.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Removed tags from ${data.updated} transaction${data.updated !== 1 ? "s" : ""}`);
        setSelectedIds(new Set());
        queryClient.invalidateQueries();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const bulkDeleteMutation = useMutation(
    trpc.transaction.bulkDelete.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Deleted ${data.deleted} transaction${data.deleted !== 1 ? "s" : ""}`);
        setSelectedIds(new Set());
        queryClient.invalidateQueries();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const isBulkPending =
    bulkCategoryMutation.isPending ||
    bulkVisibilityMutation.isPending ||
    bulkAddTagsMutation.isPending ||
    bulkRemoveTagsMutation.isPending ||
    bulkDeleteMutation.isPending;

  // ── Ophelia: silent auto-categorization on scroll ─────────────────
  // Runs silently in the background whenever loaded transactions contain
  // rows that have never been processed by Ophelia (opheliaProcessedAt === null).
  // Chains automatically: after each 200-transaction batch completes the
  // query is invalidated, transactions refresh, and the effect re-fires
  // until no unprocessed rows remain.
  const autoCategorizeMutation = useMutation(
    trpc.ophelia.runCategorization.mutationOptions({
      onSuccess: (data) => {
        if (data.opheliaEnabled && data.processed > 0) {
          queryClient.invalidateQueries({ queryKey: infiniteQueryKey });
        }
      },
    })
  );

  useEffect(() => {
    if (autoCategorizeMutation.isPending) return;
    const hasUnprocessed = transactions.some(
      (t) => !t.isInitialBalance && t.opheliaProcessedAt === null
    );
    if (!hasUnprocessed) return;
    autoCategorizeMutation.mutate({ batchSize: 200 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, autoCategorizeMutation.isPending]);

  // ── Ophelia categorization ─────────────────────────────────────────
  const categorizeMutation = useMutation(
    trpc.ophelia.runCategorization.mutationOptions({
      onSuccess: (data) => {
        if (!data.opheliaEnabled) {
          toast.error("Ophelia AI is not enabled");
          return;
        }
        const { processed, skipped, errors, hasMore } = data;
        if (errors > 0 && processed === 0) {
          toast.error(
            `Ophelia encountered ${errors} error${errors !== 1 ? "s" : ""} — check the server logs`
          );
        } else if (processed === 0 && skipped > 0) {
          toast.success("All transactions are already up to date");
        } else if (processed === 0 && skipped === 0 && errors === 0) {
          toast.success("All transactions are already categorized");
        } else {
          const msg =
            `Ophelia categorized ${processed} transaction${processed !== 1 ? "s" : ""}` +
            (skipped > 0 ? ` · ${skipped} skipped` : "") +
            (errors > 0 ? ` · ${errors} errors` : "") +
            (hasMore ? " · more remaining, click again" : "");
          toast.success(msg);
        }
        queryClient.invalidateQueries();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds]);

  // ── Derived data for filters ───────────────────────────────────────

  // Account filter groups (Liquid / Illiquid)
  const accountFilterGroups: FilterOptionGroup[] = useMemo(() => {
    const accounts = accountsQuery.data ?? [];
    return SIDEBAR_GROUPS.map((sg) => ({
      label: sg.label,
      options: accounts
        .filter((a) => ACCOUNT_TYPE_META[a.type]?.sidebarGroup === sg.key)
        .map((a) => ({ value: a.id, label: a.name })),
    })).filter((g) => g.options.length > 0);
  }, [accountsQuery.data]);

  // Category filter groups (by parent group)
  const categoryFilterGroups: FilterOptionGroup[] = useMemo(() => {
    const groups = categoriesQuery.data ?? [];
    return groups.map((group) => ({
      label: group.name,
      options: group.children.map((cat) => ({
        value: cat.id,
        label: cat.name,
        icon: cat.icon ?? undefined,
      })),
    })).filter((g) => g.options.length > 0);
  }, [categoriesQuery.data]);

  // Tag filter groups (by tag group, or single flat group)
  const tagFilterGroups: FilterOptionGroup[] = useMemo(() => {
    const tags = tagsQuery.data ?? [];
    const grouped = new Map<string, { label: string; options: FilterOptionGroup["options"] }>();
    for (const tag of tags) {
      const groupKey = tag.group?.name ?? "Tags";
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, { label: groupKey, options: [] });
      }
      grouped.get(groupKey)!.options.push({ value: tag.id, label: tag.name });
    }
    return Array.from(grouped.values());
  }, [tagsQuery.data]);

  // Selected account for header display (when single account is filtered)
  const selectedAccount = useMemo(() => {
    if (filters.accountIds.length !== 1) return null;
    return (accountsQuery.data ?? []).find((a) => a.id === filters.accountIds[0]) ?? null;
  }, [filters.accountIds, accountsQuery.data]);

  // ── Active filters check ───────────────────────────────────────────
  const hasActiveFilters =
    filters.search !== "" ||
    filters.accountIds.length > 0 ||
    filters.categoryIds.length > 0 ||
    filters.tagIds.length > 0 ||
    filters.type !== "" ||
    filters.transferType !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.accrualDateFrom !== "" ||
    filters.accrualDateTo !== "" ||
    filters.visibility !== "" ||
    filters.amountMin !== "" ||
    filters.amountMax !== "" ||
    filters.liquidOnly !== "" ||
    filters.uncategorized ||
    filters.noTags;

  const activeFilterCount = [
    filters.search !== "",
    filters.accountIds.length > 0,
    filters.categoryIds.length > 0,
    filters.tagIds.length > 0,
    filters.type !== "" || filters.transferType !== "",
    filters.dateFrom !== "" || filters.dateTo !== "",
    filters.accrualDateFrom !== "" || filters.accrualDateTo !== "",
    filters.visibility !== "",
    filters.amountMin !== "" || filters.amountMax !== "",
    filters.uncategorized,
    filters.noTags,
  ].filter(Boolean).length;

  const clearAllFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              {mounted && selectedAccount ? selectedAccount.name : "Transactions"}
            </h1>
            {mounted && selectedAccount && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {ACCOUNT_TYPE_META[selectedAccount.type]?.label ?? selectedAccount.type}
                {selectedAccount.institution && ` · ${selectedAccount.institution}`}
              </p>
            )}
          </div>
          {selectedAccount && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateFilter("accountIds", [])}
              className="text-muted-foreground"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => categorizeMutation.mutate(undefined)}
            disabled={categorizeMutation.isPending}
            title="Run Ophelia AI categorization on uncategorized transactions"
          >
            {categorizeMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1.5" />
            )}
            <span className="hidden sm:inline">Categorize</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push("/transactions/import")}>
            <Upload className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button size="sm" onClick={() => router.push("/transactions/new")}>
            <Plus className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">New</span>
          </Button>
        </div>
      </div>

      {/* ── Active filter summary ─────────────────────────────────────── */}
      <div className="space-y-2">
        {/* Active filter summary + clear */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            {(filters.accrualDateFrom || filters.accrualDateTo) && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-medium">
                Budget month: {filters.accrualDateFrom?.slice(0, 7) ?? filters.accrualDateTo?.slice(0, 7)}
                <button
                  onClick={() => setFilters((f) => ({ ...f, accrualDateFrom: "", accrualDateTo: "" }))}
                  className="ml-0.5 hover:text-blue-700 dark:hover:text-blue-300"
                  title="Clear budget month filter"
                >
                  ×
                </button>
              </span>
            )}
            <span>{activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active</span>
            <span className="text-border">·</span>
            <span className="text-muted-foreground/70">
              {transactionsQuery.data
                ? `${transactions.length}${hasMore ? "+" : ""} results`
                : "Loading..."}
            </span>
            <button
              onClick={clearAllFilters}
              className="ml-1 text-xs text-primary hover:text-primary/80 hover:underline transition-colors"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* ── Transaction table ──────────────────────────────────────── */}
      {transactionsQuery.isLoading && transactions.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 rounded-md bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={hasActiveFilters ? "No matching transactions" : "No transactions yet"}
          description={
            hasActiveFilters
              ? "Try adjusting your filters or search criteria."
              : "Import transactions from your bank or add one manually."
          }
          actionLabel={hasActiveFilters ? "Clear filters" : "Add transaction"}
          onAction={
            hasActiveFilters
              ? clearAllFilters
              : () => router.push("/transactions/new")
          }
        />
      ) : (
        <>
          <TransactionTable
            transactions={transactions}
            flatCategories={flatCategories}
            allTags={tagsQuery.data ?? []}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            updatingId={updateMutation.isPending ? (updateMutation.variables as { id: string })?.id : undefined}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            columnFilters={{
              search: filters.search,
              dateFrom: filters.dateFrom,
              dateTo: filters.dateTo,
              accountIds: filters.accountIds,
              categoryIds: filters.categoryIds,
              tagIds: filters.tagIds,
              uncategorized: filters.uncategorized,
              noTags: filters.noTags,
              amountMin: filters.amountMin,
              amountMax: filters.amountMax,
              type: filters.type,
              transferType: filters.transferType,
            }}
            onColumnFilterChange={(key, value) =>
              setFilters((prev) => ({ ...prev, [key]: value }))
            }
            onTypeChange={(type, transferType) =>
              setFilters((prev) => ({ ...prev, type, transferType }))
            }
            accountFilterGroups={accountFilterGroups}
            categoryFilterGroups={categoryFilterGroups}
            tagFilterGroups={tagFilterGroups}
          />

          {/* Infinite scroll sentinel + spinner */}
          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-4 pb-16">
              {transactionsQuery.isFetchingNextPage && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
            </div>
          )}

          {/* Bulk action bar */}
          <BulkActionBar
            selectedCount={selectedIds.size}
            selectedTransactions={selectedTransactions}
            onDeselectAll={() => setSelectedIds(new Set())}
            categoryGroups={categoryFilterGroups}
            onBulkChangeCategory={(categoryId) =>
              bulkCategoryMutation.mutate({ ids: selectedIdsArray, categoryId })
            }
            onBulkChangeVisibility={(visibility) =>
              bulkVisibilityMutation.mutate({ ids: selectedIdsArray, visibility })
            }
            allTags={tagsQuery.data ?? []}
            onBulkAddTags={(tagIds) =>
              bulkAddTagsMutation.mutate({ ids: selectedIdsArray, tagIds })
            }
            onBulkRemoveTags={(tagIds) =>
              bulkRemoveTagsMutation.mutate({ ids: selectedIdsArray, tagIds })
            }
            onBulkDelete={() =>
              bulkDeleteMutation.mutate({ ids: selectedIdsArray })
            }
            isPending={isBulkPending}
          />
        </>
      )}
    </div>
  );
}

