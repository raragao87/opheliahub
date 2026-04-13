"use client";

import { Suspense, useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
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
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MoneyDisplay } from "@/components/shared/money-display";
import { AccountEditDialog } from "@/components/accounts/account-edit-dialog";
import { MarkTransferDialog, UnmarkTransferDialog } from "@/components/transactions/mark-transfer-dialog";
import type { TransactionItem } from "@/components/transactions/transaction-table";
import { DuplicateReviewPanel } from "@/components/transactions/duplicate-review-panel";

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
  fundIds: string[];
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
  excludeTransfers: string;
  fundId: string;
  uncategorized: boolean;
  opheliaUnconfirmed: boolean;
  noTags: boolean;
  hasNotes: boolean;
  mentionedMe: boolean;
}

function filtersFromParams(sp: URLSearchParams): Filters {
  return {
    search: sp.get("search") ?? "",
    accountIds: parseCSV(sp.get("accountIds") ?? sp.get("accountId")),
    categoryIds: parseCSV(sp.get("categoryIds") ?? sp.get("categoryId")),
    fundIds: parseCSV(sp.get("fundIds")),
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
    excludeTransfers: sp.get("excludeTransfers") ?? "",
    fundId: sp.get("fundId") ?? "",
    uncategorized: sp.get("uncategorized") === "true",
    opheliaUnconfirmed: sp.get("opheliaUnconfirmed") === "true",
    noTags: sp.get("noTags") === "true",
    hasNotes: sp.get("hasNotes") === "true",
    mentionedMe: sp.get("mentionedMe") === "true",
  };
}

function filtersToParams(f: Filters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.search) sp.set("search", f.search);
  if (f.accountIds.length) sp.set("accountIds", toCSV(f.accountIds));
  if (f.categoryIds.length) sp.set("categoryIds", toCSV(f.categoryIds));
  if (f.fundIds.length) sp.set("fundIds", toCSV(f.fundIds));
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
  if (f.excludeTransfers) sp.set("excludeTransfers", f.excludeTransfers);
  if (f.fundId) sp.set("fundId", f.fundId);
  if (f.uncategorized) sp.set("uncategorized", "true");
  if (f.opheliaUnconfirmed) sp.set("opheliaUnconfirmed", "true");
  if (f.noTags) sp.set("noTags", "true");
  if (f.hasNotes) sp.set("hasNotes", "true");
  if (f.mentionedMe) sp.set("mentionedMe", "true");
  return sp;
}

function filtersEqual(a: Filters, b: Filters): boolean {
  return (
    a.search === b.search &&
    a.accountIds.join(",") === b.accountIds.join(",") &&
    a.categoryIds.join(",") === b.categoryIds.join(",") &&
    a.fundIds.join(",") === b.fundIds.join(",") &&
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
    a.excludeTransfers === b.excludeTransfers &&
    a.fundId === b.fundId &&
    a.uncategorized === b.uncategorized &&
    a.opheliaUnconfirmed === b.opheliaUnconfirmed &&
    a.noTags === b.noTags &&
    a.hasNotes === b.hasNotes &&
    a.mentionedMe === b.mentionedMe
  );
}

const EMPTY_FILTERS: Filters = {
  search: "",
  accountIds: [],
  categoryIds: [],
  fundIds: [],
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
  excludeTransfers: "",
  fundId: "",
  uncategorized: false,
  opheliaUnconfirmed: false,
  noTags: false,
  hasNotes: false,
  mentionedMe: false,
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

  // Detect duplicates=pending URL param for showing review panel
  const duplicatesFilter = searchParams.get("duplicates");

  // Sync URL params → filter state (when URL changes externally)
  useEffect(() => {
    setFilters((prev) => {
      const next = filtersFromParams(searchParams);
      return filtersEqual(prev, next) ? prev : next;
    });
  }, [searchParams]);

  // Sync filter state → URL params (debounced)
  // Uses history.replaceState instead of router.replace to avoid triggering
  // a Next.js navigation that would re-suspend the component tree and
  // unmount open dropdowns (e.g. the search filter).
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      const currentParams = filtersFromParams(searchParams);
      if (!filtersEqual(filters, currentParams)) {
        const newParams = filtersToParams(filters);
        const qs = newParams.toString();
        window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
      }
    }, 300);
    return () => clearTimeout(syncTimeoutRef.current);
  }, [filters, searchParams]);

  // ── Convenience updaters ───────────────────────────────────────────
  const updateFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ── Data queries ───────────────────────────────────────────────────
  const sessionQuery = useQuery(trpc.auth.getSession.queryOptions());
  const currentUserId = sessionQuery.data?.user?.id;

  const householdQuery = useQuery(trpc.household.get.queryOptions());
  const members = useMemo(
    () =>
      (householdQuery.data?.members ?? []).map((m) => ({
        id: m.userId,
        name: m.user.name ?? "Unknown",
        image: m.user.image ?? null,
      })),
    [householdQuery.data]
  );

  const accountsQuery = useQuery(trpc.account.list.queryOptions());
  const categoriesQuery = useQuery(
    trpc.category.tree.queryOptions({ visibility: visibilityParam })
  );
  const tagsQuery = useQuery(
    trpc.tag.list.queryOptions({ visibility: visibilityParam })
  );
  const fundsQuery = useQuery(
    trpc.fund.listForDropdown.queryOptions({ visibility: visibilityParam })
  );
  const assetsQuery = useQuery(trpc.investmentAsset.list.queryOptions());

  // ── Build query input ──────────────────────────────────────────────
  const PAGE_SIZE = 50;

  const queryInput = useMemo(() => {
    const amountMinCents = filters.amountMin ? toCents(parseFloat(filters.amountMin)) : undefined;
    const amountMaxCents = filters.amountMax ? toCents(parseFloat(filters.amountMax)) : undefined;

    return {
      search: filters.search || undefined,
      visibility: (filters.visibility as "SHARED" | "PERSONAL") || visibilityParam,
      accountIds: filters.accountIds.length ? filters.accountIds : undefined,
      categoryIds: !filters.uncategorized && !filters.opheliaUnconfirmed && filters.categoryIds.length ? filters.categoryIds : undefined,
      fundIds: !filters.uncategorized && !filters.opheliaUnconfirmed && filters.fundIds.length ? filters.fundIds : undefined,
      type: (filters.type as "INCOME" | "EXPENSE" | "FUND" | "TRANSFER" | "INVESTMENT") || undefined,
      transferType: (filters.transferType as "INTERNAL" | "EXTERNAL") || undefined,
      dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
      dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
      accrualDateFrom: filters.accrualDateFrom ? new Date(filters.accrualDateFrom) : undefined,
      accrualDateTo: filters.accrualDateTo ? new Date(filters.accrualDateTo) : undefined,
      amountMin: !isNaN(amountMinCents ?? NaN) ? amountMinCents : undefined,
      amountMax: !isNaN(amountMaxCents ?? NaN) ? amountMaxCents : undefined,
      liquidOnly: filters.liquidOnly === "true" || undefined,
      excludeTransfers: filters.excludeTransfers === "true" || undefined,
      fundId: filters.fundId || undefined,
      uncategorized: filters.uncategorized || undefined,
      opheliaUnconfirmed: filters.opheliaUnconfirmed || undefined,
      noTags: filters.noTags || undefined,
      hasNotes: filters.hasNotes || undefined,
      mentionedMe: filters.mentionedMe || undefined,
      limit: PAGE_SIZE,
    };
  }, [filters, visibilityParam]);

  const transactionsQuery = useInfiniteQuery({
    ...trpc.transaction.list.infiniteQueryOptions(queryInput, {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }),
    placeholderData: keepPreviousData,
  });

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
                          if (cat) return { id: cat.id, name: cat.name, icon: cat.icon ?? null, color: null };
                          // Fallback: use opheliaCategory if this was an Ophelia accept
                          if (txn.opheliaCategory?.id === variables.categoryId) {
                            return { id: txn.opheliaCategory.id, name: txn.opheliaCategory.name, icon: null, color: null };
                          }
                          // Category not found in local data — still set a stub so the
                          // Ophelia branch doesn't re-render (category !== null)
                          return { id: variables.categoryId, name: "…", icon: null, color: null };
                        })(),
                      }),
                      // Fund: clear when setting a category, set when assigning a fund
                      ...("fundId" in variables && {
                        fundId: variables.fundId ?? null,
                        fund: (() => {
                          if (!variables.fundId) return null;
                          const f = (fundsQuery.data ?? []).find((fd: { id: string }) => fd.id === variables.fundId);
                          if (f) return { id: f.id, name: f.name, icon: f.icon ?? null };
                          return { id: variables.fundId as string, name: "…", icon: null };
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
      onError: (err, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(infiniteQueryKey, context.previous);
        }
        toast.error(`Failed to update: ${err.message}`);
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

  // ── Selection state ────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectedTransactions = useMemo(() => {
    return transactions
      .filter((t) => selectedIds.has(t.id))
      .map((t) => ({
        id: t.id,
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

  const confirmOpheliaMutation = useMutation(
    trpc.transaction.confirmOpheliaSuggestions.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Confirmed ${data.confirmed} Ophelia suggestion${data.confirmed !== 1 ? "s" : ""}`);
        queryClient.invalidateQueries();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const isBulkPending =
    bulkCategoryMutation.isPending ||
    bulkAddTagsMutation.isPending ||
    bulkRemoveTagsMutation.isPending ||
    bulkDeleteMutation.isPending;

  // ── Ophelia: silent auto-categorization on scroll ─────────────────
  // Runs silently in the background whenever loaded transactions contain
  // rows that have never been processed by Ophelia (opheliaProcessedAt === null).
  // Chains automatically: after each successful batch the query is invalidated
  // and the effect re-fires until no unprocessed rows remain.
  //
  // Safeguards:
  //   - Max 2 consecutive failures before stopping (prevents infinite loops)
  //   - 30s cooldown between calls (prevents hammering after query invalidations)
  const autoRetryCount = useRef(0);
  const lastAutoRunTime = useRef(0);
  const MAX_AUTO_RETRIES = 2;
  const AUTO_COOLDOWN_MS = 30_000;

  const autoCategorizeMutation = useMutation(
    trpc.ophelia.runCategorization.mutationOptions()
  );

  useEffect(() => {
    if (autoCategorizeMutation.isPending) return;
    if (autoRetryCount.current >= MAX_AUTO_RETRIES) return;
    if (Date.now() - lastAutoRunTime.current < AUTO_COOLDOWN_MS) return;

    const hasUnprocessed = transactions.some(
      (t) => !t.isInitialBalance && t.opheliaProcessedAt === null
    );
    if (!hasUnprocessed) {
      autoRetryCount.current = 0; // reset on clean state
      return;
    }

    lastAutoRunTime.current = Date.now();
    autoCategorizeMutation.mutate({ batchSize: 200 }, {
      onSuccess: (data) => {
        if (data.opheliaEnabled && data.processed > 0) {
          autoRetryCount.current = 0;
          queryClient.invalidateQueries({ queryKey: infiniteQueryKey });
        } else if (data.errors > 0 && data.processed === 0) {
          autoRetryCount.current++;
        }
      },
      onError: () => {
        autoRetryCount.current++;
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, autoCategorizeMutation.isPending]);

  const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds]);

  // ── Derived data for filters ───────────────────────────────────────

  // Account filter groups (Liquid / Illiquid) — filtered by current visibility
  const accountFilterGroups: FilterOptionGroup[] = useMemo(() => {
    const accounts = (accountsQuery.data ?? []).filter(
      (a) => a.ownership === visibilityParam
    );
    return SIDEBAR_GROUPS.map((sg) => ({
      label: sg.label,
      options: accounts
        .filter((a) => ACCOUNT_TYPE_META[a.type]?.sidebarGroup === sg.key)
        .map((a) => ({ value: a.id, label: a.name })),
    })).filter((g) => g.options.length > 0);
  }, [accountsQuery.data, visibilityParam]);

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

  // ── Account description, links, and edit dialog state ─────────────
  const [descEditing, setDescEditing] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const descRef = useRef<HTMLTextAreaElement>(null);
  const [accountLinks, setAccountLinks] = useState<Array<{ label: string; url: string }>>([]);
  const [linksInit, setLinksInit] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [suggestedLinks, setSuggestedLinks] = useState<Array<{ label: string; url: string }>>([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [markTransferTxn, setMarkTransferTxn] = useState<TransactionItem | null>(null);
  const [unmarkTransferTxn, setUnmarkTransferTxn] = useState<TransactionItem | null>(null);

  // Init links from account data
  useEffect(() => {
    if (selectedAccount && !linksInit) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (selectedAccount as any).links;
      if (Array.isArray(raw)) setAccountLinks(raw);
      setLinksInit(true);
    }
  }, [selectedAccount, linksInit]);

  // Reset when account changes
  useEffect(() => {
    setLinksInit(false);
    setAccountLinks([]);
    setDescEditing(false);
    setDescDraft("");
    setSuggestedLinks([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount?.id]);

  const accountUpdateMutation = useMutation(
    trpc.account.update.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
      onError: (err) => toast.error(`Failed to update account: ${err.message}`),
    })
  );

  const generateDescMutation = useMutation(
    trpc.account.generateDescription.mutationOptions({
      onSuccess: (data) => {
        setDescDraft(data.description);
        setDescEditing(true);
        setSuggestedLinks(data.suggestedLinks);
      },
      onError: (err) => toast.error(`Failed to generate description: ${err.message}`),
    })
  );

  // ── Active filters check ───────────────────────────────────────────
  const hasActiveFilters =
    filters.search !== "" ||
    filters.accountIds.length > 0 ||
    filters.categoryIds.length > 0 ||
    filters.fundIds.length > 0 ||
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
    filters.excludeTransfers !== "" ||
    filters.fundId !== "" ||
    filters.uncategorized ||
    filters.opheliaUnconfirmed ||
    filters.noTags ||
    filters.hasNotes ||
    filters.mentionedMe;

  const activeFilterCount = [
    filters.search !== "",
    filters.accountIds.length > 0,
    filters.categoryIds.length > 0 || filters.fundIds.length > 0,
    filters.tagIds.length > 0,
    filters.type !== "" || filters.transferType !== "",
    filters.dateFrom !== "" || filters.dateTo !== "",
    filters.accrualDateFrom !== "" || filters.accrualDateTo !== "",
    filters.visibility !== "",
    filters.amountMin !== "" || filters.amountMax !== "",
    filters.uncategorized,
    filters.opheliaUnconfirmed,
    filters.noTags,
    filters.hasNotes,
    filters.mentionedMe,
  ].filter(Boolean).length;

  const clearAllFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  // ── Header visibility (for sticky bar) ────────────────────────────
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerVisible, setHeaderVisible] = useState(true);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeaderVisible(entry.isIntersecting),
      { threshold: 0, rootMargin: "-64px 0px 0px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div ref={headerRef} className="flex items-start justify-between gap-4">
        <div className="shrink-0">
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

        {/* Description + links inline in header */}
        {mounted && selectedAccount && (
          <div className="flex-1 min-w-0 pt-1 space-y-1">
            {/* Description */}
            {!descEditing ? (
              <div className="flex items-start gap-1.5">
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => { setDescDraft(selectedAccount.notes ?? ""); setDescEditing(true); }}
                >
                  {selectedAccount.notes ? (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-2">{selectedAccount.notes}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground/40 italic">Add a description...</p>
                  )}
                </div>
                <Button
                  variant="ghost" size="sm" className="h-5 w-5 p-0 shrink-0"
                  disabled={generateDescMutation.isPending}
                  onClick={() => generateDescMutation.mutate({ id: selectedAccount.id })}
                  title="Generate description with Ophelia"
                >
                  {generateDescMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                </Button>
              </div>
            ) : (
              <textarea
                ref={descRef}
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={() => {
                  accountUpdateMutation.mutate({ id: selectedAccount.id, notes: descDraft || null });
                  setDescEditing(false);
                }}
                rows={2}
                maxLength={120}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring resize-none"
                placeholder="Write a short description (max 120 chars)..."
                autoFocus
              />
            )}

            {/* Links */}
            <div className="flex flex-wrap gap-1 items-center">
              {accountLinks.map((link, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0 text-[11px]">
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="hover:underline max-w-[140px] truncate text-muted-foreground hover:text-foreground">{link.label}</a>
                  <button onClick={() => { const updated = accountLinks.filter((_, i) => i !== idx); setAccountLinks(updated); accountUpdateMutation.mutate({ id: selectedAccount.id, links: updated }); }} className="text-muted-foreground/40 hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                </span>
              ))}
              {accountLinks.length < 6 && !addingLink && (
                <button onClick={() => setAddingLink(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/60 px-2 py-0 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                  + Add link
                </button>
              )}
              {addingLink && (
                <div className="flex gap-1 items-center">
                  <input placeholder="Label" value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} className="h-5 text-[11px] w-24 rounded border border-input bg-background px-1.5" />
                  <input placeholder="https://..." value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} className="h-5 text-[11px] w-40 rounded border border-input bg-background px-1.5"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newLinkLabel && newLinkUrl) {
                        const updated = [...accountLinks, { label: newLinkLabel.trim(), url: newLinkUrl.trim() }];
                        setAccountLinks(updated);
                        accountUpdateMutation.mutate({ id: selectedAccount.id, links: updated });
                        setNewLinkLabel(""); setNewLinkUrl(""); setAddingLink(false);
                      }
                      if (e.key === "Escape") setAddingLink(false);
                    }}
                  />
                  <button onClick={() => setAddingLink(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {suggestedLinks.map((sl, idx) => (
                <button key={idx} onClick={() => {
                  if (accountLinks.length >= 6) return;
                  const updated = [...accountLinks, sl];
                  setAccountLinks(updated);
                  accountUpdateMutation.mutate({ id: selectedAccount.id, links: updated });
                  setSuggestedLinks((prev) => prev.filter((l) => l.url !== sl.url));
                }}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0 text-[11px] text-primary/70 hover:text-primary transition-colors">
                  {sl.label} +
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {selectedAccount && (
            <Button variant="ghost" size="sm" onClick={() => setEditDialogOpen(true)} title="Account settings">
              <Settings className="h-4 w-4" />
            </Button>
          )}
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
            {filters.opheliaUnconfirmed && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium">
                <Sparkles className="h-3 w-3" />
                Needs confirmation
                <button
                  onClick={() => setFilters((f) => ({ ...f, opheliaUnconfirmed: false }))}
                  className="ml-0.5 hover:text-amber-700 dark:hover:text-amber-300"
                  title="Clear filter"
                >
                  ×
                </button>
              </span>
            )}
            {filters.uncategorized && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border font-medium">
                Uncategorized
                <button
                  onClick={() => setFilters((f) => ({ ...f, uncategorized: false }))}
                  className="ml-0.5 hover:text-foreground"
                  title="Clear filter"
                >
                  ×
                </button>
              </span>
            )}
            {filters.mentionedMe && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium">
                Mentions me
                <button
                  onClick={() => setFilters((f) => ({ ...f, mentionedMe: false }))}
                  className="ml-0.5 hover:text-amber-700 dark:hover:text-amber-300"
                  title="Clear filter"
                >
                  ×
                </button>
              </span>
            )}
            {filters.fundId && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 font-medium">
                Fund
                <button
                  onClick={() => setFilters((f) => ({ ...f, fundId: "" }))}
                  className="ml-0.5 hover:text-violet-700 dark:hover:text-violet-300"
                  title="Clear fund filter"
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
            {filters.opheliaUnconfirmed && transactions.length > 0 && (
              <button
                onClick={() => confirmOpheliaMutation.mutate({ visibility: visibilityParam })}
                disabled={confirmOpheliaMutation.isPending}
                className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />
                {confirmOpheliaMutation.isPending ? "Confirming..." : `Confirm all ${transactions.length}${hasMore ? "+" : ""} suggestions`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Sticky account info bar — only when header is scrolled away */}
      {mounted && selectedAccount && !headerVisible && (
        <div className="sticky top-16 z-20 bg-card border-b border-border px-4 py-2 -mx-4 md:-mx-6 lg:-mx-8 md:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium truncate">{selectedAccount.name}</span>
            <span className="text-xs text-muted-foreground">
              {ACCOUNT_TYPE_META[selectedAccount.type]?.label ?? selectedAccount.type}
              {selectedAccount.institution && ` · ${selectedAccount.institution}`}
            </span>
          </div>
          <MoneyDisplay
            amount={selectedAccount.balance}
            currency={selectedAccount.currency}
            className="text-sm font-semibold shrink-0"
          />
        </div>
      )}



      {/* ── Account edit dialog ─────────────────────────────────────── */}
      {selectedAccount && (
        <AccountEditDialog
          accountId={selectedAccount.id}
          open={editDialogOpen}
          onClose={() => setEditDialogOpen(false)}
        />
      )}

      {/* ── Mark/unmark transfer dialogs ───────────────────────────── */}
      <MarkTransferDialog
        transaction={markTransferTxn}
        open={!!markTransferTxn}
        onClose={() => setMarkTransferTxn(null)}
        onSuccess={() => setMarkTransferTxn(null)}
      />
      <UnmarkTransferDialog
        transaction={unmarkTransferTxn}
        open={!!unmarkTransferTxn}
        onClose={() => setUnmarkTransferTxn(null)}
        onSuccess={() => setUnmarkTransferTxn(null)}
      />

      {/* ── Transaction table ──────────────────────────────────────── */}
      {transactionsQuery.isLoading && transactions.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 rounded-md bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : transactions.length === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={Receipt}
          title="No transactions yet"
          description="Import transactions from your bank or add one manually."
          actionLabel="Add transaction"
          onAction={() => router.push("/transactions/new")}
        />
      ) : (
        <>
          {duplicatesFilter === "pending" && (
            <DuplicateReviewPanel
              accountId={filters.accountIds.length === 1 ? filters.accountIds[0] : undefined}
            />
          )}
          <TransactionTable
            transactions={transactions}
            flatCategories={flatCategories}
            funds={fundsQuery.data ?? []}
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
              fundIds: filters.fundIds,
              tagIds: filters.tagIds,
              uncategorized: filters.uncategorized,
              opheliaUnconfirmed: filters.opheliaUnconfirmed,
              noTags: filters.noTags,
              hasNotes: filters.hasNotes,
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
            onMarkAsTransfer={setMarkTransferTxn}
            onUnmarkTransfer={setUnmarkTransferTxn}
            stickyOffset={selectedAccount && !headerVisible ? 104 : 64}
            members={members}
            currentUserId={currentUserId}
            assets={assetsQuery.data ?? []}
          />

          {/* No results with active filters */}
          {transactions.length === 0 && hasActiveFilters && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No matching transactions.{" "}
              <button onClick={clearAllFilters} className="text-primary hover:underline">
                Clear all filters
              </button>
            </div>
          )}

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
            funds={fundsQuery.data ?? []}
            onBulkChangeCategory={(value) => {
              if (value?.startsWith("__FUND__")) {
                const fundId = value.replace("__FUND__", "");
                bulkCategoryMutation.mutate({ ids: selectedIdsArray, categoryId: null, fundId });
              } else {
                bulkCategoryMutation.mutate({ ids: selectedIdsArray, categoryId: value, fundId: null });
              }
            }}
            tagGroups={tagFilterGroups}
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

