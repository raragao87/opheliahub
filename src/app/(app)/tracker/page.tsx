"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/money-display";
import { InlineMoneyEdit } from "@/components/shared/inline-money-edit";
import { getCurrentYearMonth, getPreviousMonth, getNextMonth } from "@/lib/date";
import { useOwnership } from "@/lib/ownership-context";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { t } from "@/lib/translations";
import { useUserPreferences } from "@/lib/user-preferences-context";
import { EmojiPickerButton } from "@/components/ui/emoji-picker";
import { FundCalculator } from "@/components/tracker/fund-calculator";
import { toCents } from "@/lib/money";

// FundData type — matches the shape returned by fund.list
interface FundData {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  budget: number;
  thisMonthActual: number;
  available: number;
  totalBudgeted: number;
  totalSpending: number;
  adjustments: number;
  entries: Array<{ id: string; amount: number; note: string | null; year: number; month: number; createdAt: Date }>;
  lineItems: Array<{ id: string; description: string; period: number; amount: number; sortOrder: number }>;
  linkedAccount: { id: string; name: string; balance: number; currency: string } | null;
  sortOrder: number;
}
import { DeleteCategoryDialog } from "@/components/tracker/delete-category-dialog";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Copy,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  GripVertical,
  Sparkles,
  Calculator,
} from "lucide-react";

// ── Color coding helpers ──────────────────────────────────────────

function getAvailableColor(remaining: number, allocated: number, spent: number): string {
  if (allocated === 0 && spent === 0) return "text-muted-foreground/50";
  if (remaining > 0) return "text-green-600 dark:text-green-400";
  if (remaining === 0) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function getAvailableBg(remaining: number, allocated: number, spent: number): string {
  if (allocated === 0 && spent === 0) return "";
  if (remaining > 0) return "bg-green-100 dark:bg-green-950/40";
  if (remaining === 0) return "bg-yellow-100 dark:bg-yellow-950/40";
  return "bg-red-100 dark:bg-red-950/40";
}

function getRowBorder(remaining: number, allocated: number, spent: number): string {
  if (allocated === 0 && spent === 0) return "";
  if (remaining > 0) return "border-l-2 border-l-green-500";
  if (remaining === 0) return "border-l-2 border-l-yellow-500";
  return "border-l-2 border-l-red-500";
}

// ── Available Cell ────────────────────────────────────────────────

function AvailableCell({
  amount,
  allocated,
  spent,
}: {
  amount: number;
  allocated: number;
  spent: number;
}) {
  if (allocated === 0 && spent === 0) {
    return <span className="text-sm text-muted-foreground/40">—</span>;
  }

  const colorClass = getAvailableColor(amount, allocated, spent);
  const bgClass = getAvailableBg(amount, allocated, spent);

  // Progress bar: show when there's a budget allocated and actual spending
  const showProgress = allocated > 0 && spent > 0;
  const pct = showProgress ? Math.min((spent / allocated) * 100, 100) : 0;
  const barColor =
    pct >= 100
      ? "bg-red-500"
      : pct >= 80
        ? "bg-yellow-500"
        : "bg-green-500";

  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <span className={cn("inline-block rounded-sm px-1.5 py-0.5", bgClass)}>
        <MoneyDisplay
          amount={amount}
          colorize={false}
          className={cn("text-sm font-medium", colorClass)}
        />
      </span>
      {showProgress && (
        <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ── Income Available Cell (different semantics) ─────────────────

function IncomeAvailableCell({
  amount,
  allocated,
  incomeActual,
}: {
  amount: number;
  allocated: number;
  incomeActual: number;
}) {
  if (allocated === 0 && incomeActual === 0) {
    return <span className="text-sm text-muted-foreground/40">—</span>;
  }

  // Income available: 0 = all received (green), >0 = pending (amber), <0 = bonus (green)
  const colorClass = amount <= 0
    ? "text-green-600 dark:text-green-400"
    : "text-amber-600 dark:text-amber-400";
  const bgClass = amount <= 0
    ? "bg-green-100 dark:bg-green-950/40"
    : "bg-amber-100 dark:bg-amber-950/40";

  const showProgress = allocated > 0 && incomeActual > 0;
  const pct = showProgress ? Math.min((incomeActual / allocated) * 100, 100) : 0;
  const barColor = pct >= 100 ? "bg-green-500" : pct >= 80 ? "bg-blue-500" : "bg-amber-500";

  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <span className={cn("inline-block rounded-sm px-1.5 py-0.5", bgClass)}>
        <MoneyDisplay
          amount={amount}
          colorize={false}
          className={cn("text-sm font-medium", colorClass)}
        />
      </span>
      {showProgress && (
        <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ── Link builder for Actual column → Transactions page ────────────

function buildCategoryTransactionsUrl(
  categoryId: string,
  period: { year: number; month: number }
) {
  const mm = String(period.month).padStart(2, "0");
  const lastDay = new Date(period.year, period.month, 0).getDate();
  const accrualDateFrom = `${period.year}-${mm}-01`;
  const accrualDateTo = `${period.year}-${mm}-${String(lastDay).padStart(2, "0")}`;
  return `/transactions?categoryId=${categoryId}&accrualDateFrom=${accrualDateFrom}&accrualDateTo=${accrualDateTo}&liquidOnly=true`;
}

function buildFundTransactionsUrl(
  fundId: string,
  period: { year: number; month: number }
) {
  const mm = String(period.month).padStart(2, "0");
  const lastDay = new Date(period.year, period.month, 0).getDate();
  const accrualDateFrom = `${period.year}-${mm}-01`;
  const accrualDateTo = `${period.year}-${mm}-${String(lastDay).padStart(2, "0")}`;
  return `/transactions?fundId=${fundId}&accrualDateFrom=${accrualDateFrom}&accrualDateTo=${accrualDateTo}&liquidOnly=true`;
}

// ── Main Component ────────────────────────────────────────────────

export default function TrackerPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { visibilityParam } = useOwnership();
  const { preferences } = useUserPreferences();
  const lang = preferences.language;

  const [period, setPeriod] = useState(getCurrentYearMonth());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Category management state
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [addingCategoryToGroup, setAddingCategoryToGroup] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("");
  const [showAddGroup, setShowAddGroup] = useState<"INCOME" | "EXPENSE" | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupIcon, setNewGroupIcon] = useState("");
  const [editingGroupType, setEditingGroupType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [editingIcon, setEditingIcon] = useState("");
  const [iconSuggestions, setIconSuggestions] = useState<string[]>([]);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<{
    id: string;
    name: string;
    icon: string | null;
    transactionCount: number;
  } | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(period.year);
  const monthPickerRef = useRef<HTMLDivElement>(null);

  // Close month picker on click outside
  useEffect(() => {
    if (!showMonthPicker) return;
    const handler = (e: MouseEvent) => {
      if (monthPickerRef.current && !monthPickerRef.current.contains(e.target as Node)) {
        setShowMonthPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMonthPicker]);

  // Tracker is per-visibility
  const visibility = visibilityParam ?? "SHARED";

  const trackerQuery = useQuery(
    trpc.tracker.getOrCreate.queryOptions({
      month: period.month,
      year: period.year,
      visibility,
    })
  );

  const summaryQuery = useQuery(
    trpc.tracker.getSummary.queryOptions({
      month: period.month,
      year: period.year,
      visibility,
    })
  );

  const treeQuery = useQuery(trpc.category.tree.queryOptions({ visibility }));

  // Funds query
  const fundsQuery = useQuery(
    trpc.fund.list.queryOptions({ visibility, month: period.month, year: period.year })
  );

  // Fund UI state
  const [editingFundId, setEditingFundId] = useState<string | null>(null);
  const [editingFundName, setEditingFundName] = useState("");
  const [editingFundIcon, setEditingFundIcon] = useState("");
  const [fundIconSuggestions, setFundIconSuggestions] = useState<string[]>([]);
  const fundSuggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [calculatorFundId, setCalculatorFundId] = useState<string | null>(null);
  const [showAddFund, setShowAddFund] = useState(false);
  const [newFundName, setNewFundName] = useState("");
  const [newFundIcon, setNewFundIcon] = useState("");
  const [expandedFundId, setExpandedFundId] = useState<string | null>(null);
  const [adjustingFundId, setAdjustingFundId] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");

  // Fund mutations
  const setFundAllocationMutation = useMutation(
    trpc.tracker.setFundAllocation.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    })
  );

  const createFundMutation = useMutation(
    trpc.fund.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setShowAddFund(false);
        setNewFundName("");
        setNewFundIcon("");
      },
    })
  );

  const updateFundMutation = useMutation(
    trpc.fund.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setEditingFundId(null);
        setEditingFundName("");
        setEditingFundIcon("");
        setFundIconSuggestions([]);
      },
    })
  );

  const deleteFundMutation = useMutation(
    trpc.fund.delete.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    })
  );

  const reorderFundsMutation = useMutation(
    trpc.fund.reorder.mutationOptions({
      onSettled: () => queryClient.invalidateQueries(),
    })
  );

  const updateLinkedAccountMutation = useMutation(
    trpc.fund.updateLinkedAccount.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    })
  );

  const addFundEntryMutation = useMutation(
    trpc.fund.addEntry.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setAdjustingFundId(null);
        setAdjustAmount("");
        setAdjustNote("");
      },
    })
  );

  const deleteFundEntryMutation = useMutation(
    trpc.fund.deleteEntry.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    })
  );

  // Accounts query for linked account dropdown
  const accountsQuery = useQuery(trpc.account.list.queryOptions());

  const suggestFundIconMutation = useMutation(
    trpc.category.suggestIcon.mutationOptions({
      onSuccess: (data) => {
        setFundIconSuggestions(data.emojis);
      },
    })
  );

  function triggerFundIconSuggestion(name: string) {
    if (fundSuggestDebounceRef.current) clearTimeout(fundSuggestDebounceRef.current);
    if (!name.trim() || name.trim().length < 2) {
      setFundIconSuggestions([]);
      return;
    }
    fundSuggestDebounceRef.current = setTimeout(() => {
      suggestFundIconMutation.mutate({ name: name.trim() });
    }, 600);
  }

  // Tracker mutations
  const setAllocationMutation = useMutation(
    trpc.tracker.setAllocation.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    })
  );

  const copyPreviousMonthMutation = useMutation(
    trpc.tracker.copyPreviousMonth.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    })
  );


  // Category mutations
  const createCategoryMutation = useMutation(
    trpc.category.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setAddingCategoryToGroup(null);
        setNewCategoryName("");
        setNewCategoryIcon("");
        setShowAddGroup(null);
        setNewGroupName("");
        setNewGroupIcon("");
      },
    })
  );

  const updateCategoryMutation = useMutation(
    trpc.category.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setEditingCategoryId(null);
        setEditingName("");
        setEditingIcon("");
      },
    })
  );

  const deleteCategoryMutation = useMutation(
    trpc.category.delete.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    })
  );

  const reorderMutation = useMutation(
    trpc.category.reorder.mutationOptions({
      onSettled: () => queryClient.invalidateQueries(),
    })
  );

  const suggestIconMutation = useMutation(
    trpc.category.suggestIcon.mutationOptions({
      onSuccess: (data) => {
        console.log("[suggestIcon] success:", data);
        setIconSuggestions(data.emojis);
      },
      onError: (err) => {
        console.error("[suggestIcon] error:", err);
        toast.error(`Ophelia error: ${err.message}`);
      },
    })
  );

  function triggerIconSuggestion(name: string) {
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    if (!name.trim() || name.trim().length < 2) {
      setIconSuggestions([]);
      return;
    }
    suggestDebounceRef.current = setTimeout(() => {
      suggestIconMutation.mutate({ name: name.trim() });
    }, 600);
  }

  // ── DnD state & sensors ──
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const isEditing = editingCategoryId !== null;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const tracker = trackerQuery.data;
  const summary = summaryQuery.data;
  const monthName = new Date(period.year, period.month - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // Build category tree with tracker data (before early return so hooks stay stable)
  const categoryGroups = treeQuery.data ?? [];
  const summaryCategories = summary?.categories ?? [];
  const summaryMap = new Map(summaryCategories.map((c) => [c.categoryId, c]));

  // Enrich tree with tracker data + sort INCOME groups first
  const groupsWithData = categoryGroups
    .map((group) => {
      const children = group.children.map((cat) => {
        const sc = summaryMap.get(cat.id);
        return {
          id: cat.id,
          name: cat.name,
          icon: cat.icon,
          allocated: sc?.allocated ?? 0,
          spent: sc?.spent ?? 0,
          remaining: (sc?.allocated ?? 0) - (sc?.spent ?? 0),
          transactionCount: cat._count.transactions,
          incomeActual: sc?.incomeActual ?? 0,
          expenseActual: sc?.expenseActual ?? 0,
        };
      });
      const groupAllocated = children.reduce((s, c) => s + c.allocated, 0);
      const groupSpent = children.reduce((s, c) => s + c.spent, 0);
      const groupIncomeActual = children.reduce((s, c) => s + c.incomeActual, 0);
      const groupExpenseActual = children.reduce((s, c) => s + c.expenseActual, 0);
      return {
        id: group.id,
        name: group.name,
        icon: group.icon,
        color: group.color,
        type: group.type as "INCOME" | "EXPENSE",
        children,
        childCount: group._count.children,
        totalAllocated: groupAllocated,
        totalSpent: groupSpent,
        totalIncomeActual: groupIncomeActual,
        totalExpenseActual: groupExpenseActual,
      };
    })
    .sort((a, b) => {
      // INCOME groups first, then EXPENSE; within same type, preserve DB sortOrder
      if (a.type === "INCOME" && b.type !== "INCOME") return -1;
      if (a.type !== "INCOME" && b.type === "INCOME") return 1;
      const aIdx = categoryGroups.findIndex((g) => g.id === a.id);
      const bIdx = categoryGroups.findIndex((g) => g.id === b.id);
      return aIdx - bIdx;
    });

  const incomeGroups = groupsWithData.filter(g => g.type === "INCOME");
  const expenseGroups = groupsWithData.filter(g => g.type === "EXPENSE");

  // Flat list of leaf categories for the delete dialog dropdown
  const flatCategoriesForDelete = useMemo(() => {
    return groupsWithData
      .flatMap((g) =>
        g.children.map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
          parentName: g.name,
        }))
      )
      .filter((c) => c.id !== deleteCategoryTarget?.id);
  }, [groupsWithData, deleteCategoryTarget]);

  // ── DnD: build flat sortable ID lists (one per table) ──
  const incomeSortableIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of incomeGroups) {
      ids.push(`group-${group.id}`);
      if (!collapsedGroups.has(group.id)) {
        for (const cat of group.children) ids.push(`cat-${cat.id}`);
      }
    }
    return ids;
  }, [incomeGroups, collapsedGroups]);

  const expenseSortableIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of expenseGroups) {
      ids.push(`group-${group.id}`);
      if (!collapsedGroups.has(group.id)) {
        for (const cat of group.children) ids.push(`cat-${cat.id}`);
      }
    }
    return ids;
  }, [expenseGroups, collapsedGroups]);

  // Active drag item for overlay
  const activeDragItem = useMemo(() => {
    if (!activeDragId) return null;
    if (activeDragId.startsWith("group-")) {
      const id = activeDragId.replace("group-", "");
      const g = groupsWithData.find((gr) => gr.id === id);
      return g ? { type: "group" as const, data: g } : null;
    }
    if (activeDragId.startsWith("cat-")) {
      const id = activeDragId.replace("cat-", "");
      for (const g of groupsWithData) {
        const c = g.children.find((ch) => ch.id === id);
        if (c) return { type: "cat" as const, data: c, groupType: g.type };
      }
    }
    return null;
  }, [activeDragId, groupsWithData]);


  // Separate budgeted vs unbudgeted expense categories
  const unbudgetedCategories = useMemo(() => {
    const result: typeof groupsWithData[0]["children"] = [];
    for (const group of groupsWithData) {
      if (group.type !== "EXPENSE") continue;
      for (const cat of group.children) {
        if (cat.allocated === 0 && cat.spent > 0) {
          result.push(cat);
        }
      }
    }
    return result;
  }, [groupsWithData]);

  // Loading state
  if (trackerQuery.isLoading || !tracker) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-[500px] w-full rounded-lg" />
      </div>
    );
  }

  // Find which group a category belongs to
  const findGroupForCat = (catId: string) =>
    groupsWithData.find((g) => g.children.some((c) => c.id === catId));

  // DnD handlers
  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeStr = active.id as string;
    const overStr = over.id as string;

    if (activeStr.startsWith("group-") && overStr.startsWith("group-")) {
      // ── Group reorder ──
      const activeGroupId = activeStr.replace("group-", "");
      const overGroupId = overStr.replace("group-", "");
      const activeGroup = groupsWithData.find((g) => g.id === activeGroupId);
      const overGroup = groupsWithData.find((g) => g.id === overGroupId);
      if (!activeGroup || !overGroup || activeGroup.type !== overGroup.type) return;

      const sameType = groupsWithData.filter((g) => g.type === activeGroup.type);
      const oldIdx = sameType.findIndex((g) => g.id === activeGroupId);
      const newIdx = sameType.findIndex((g) => g.id === overGroupId);
      if (oldIdx === -1 || newIdx === -1) return;

      const reordered = arrayMove(sameType, oldIdx, newIdx);
      const items = reordered.map((g, i) => ({
        id: g.id,
        sortOrder: i,
        parentId: null as string | null,
      }));
      reorderMutation.mutate({ items });
    } else if (activeStr.startsWith("cat-")) {
      // ── Category reorder / move ──
      const activeCatId = activeStr.replace("cat-", "");
      const sourceGroup = findGroupForCat(activeCatId);
      if (!sourceGroup) return;

      let targetGroup: typeof sourceGroup | undefined;
      let insertIndex: number;

      if (overStr.startsWith("cat-")) {
        const overCatId = overStr.replace("cat-", "");
        targetGroup = findGroupForCat(overCatId);
        if (!targetGroup) return;
        // Prevent moving between different types (INCOME ↔ EXPENSE)
        if (sourceGroup.type !== targetGroup.type) return;
        insertIndex = targetGroup.children.findIndex((c) => c.id === overCatId);
      } else if (overStr.startsWith("group-")) {
        const overGroupId = overStr.replace("group-", "");
        targetGroup = groupsWithData.find((g) => g.id === overGroupId);
        if (!targetGroup) return;
        if (sourceGroup.type !== targetGroup.type) return;
        insertIndex = 0; // drop at top of group
      } else {
        return;
      }

      // Build new children list for the target group
      let newChildren: typeof targetGroup.children;
      if (sourceGroup.id === targetGroup.id) {
        // Same group — reorder
        const oldIdx = targetGroup.children.findIndex((c) => c.id === activeCatId);
        if (oldIdx === -1) return;
        newChildren = arrayMove(targetGroup.children, oldIdx, insertIndex);
      } else {
        // Cross-group move
        const movedCat = sourceGroup.children.find((c) => c.id === activeCatId);
        if (!movedCat) return;
        newChildren = [...targetGroup.children];
        newChildren.splice(insertIndex, 0, movedCat);

        // Also reorder source group (with the cat removed)
        const sourceItems = sourceGroup.children
          .filter((c) => c.id !== activeCatId)
          .map((c, i) => ({ id: c.id, sortOrder: i, parentId: sourceGroup.id }));
        // We'll merge these into the items below
        reorderMutation.mutate({
          items: [
            ...sourceItems,
            ...newChildren.map((c, i) => ({
              id: c.id,
              sortOrder: i,
              parentId: targetGroup!.id,
            })),
          ],
        });
        return;
      }

      const items = newChildren.map((c, i) => ({
        id: c.id,
        sortOrder: i,
        parentId: targetGroup!.id,
      }));
      reorderMutation.mutate({ items });
    }
  }


  // Compute Ready to Assign from income vs expense allocations + fund contributions
  const incomeAssigned = groupsWithData
    .filter((g) => g.type === "INCOME")
    .reduce((sum, g) => sum + g.totalAllocated, 0);
  const expenseAssigned = groupsWithData
    .filter((g) => g.type === "EXPENSE")
    .reduce((sum, g) => sum + g.totalAllocated, 0);
  const fundsData = (fundsQuery.data?.funds ?? []) as FundData[];
  const historicalAccountBalance = fundsQuery.data?.historicalAccountBalance ?? null;
  const totalFundContributions = fundsData.reduce((sum, f) => sum + f.budget, 0);
  const readyToAssign = incomeAssigned - expenseAssigned - totalFundContributions;
  const totalIncomeActual = incomeGroups.reduce((s, g) => s + g.totalIncomeActual - g.totalExpenseActual, 0);

  // Actual Balance: real income received − real expenses paid (from transactions)
  const actualBalance = (summary?.actualIncome ?? 0) - (summary?.totalActualExpenses ?? 0);

  const uncategorizedEntry = summaryCategories.find((c) => !c.categoryId);

  // Budget Health scorecard computations
  const totalIncome = incomeAssigned;
  const totalAllocatedExpenses = expenseAssigned;
  const totalAllocatedAll = totalAllocatedExpenses + totalFundContributions;
  const allocationPct = totalIncome > 0 ? Math.round((totalAllocatedAll / totalIncome) * 100) : 0;

  const totalSpentExpenses = groupsWithData
    .filter((g) => g.type === "EXPENSE")
    .reduce((sum, g) => sum + g.totalSpent, 0)
    + (uncategorizedEntry?.spent ?? 0);
  const spendingPct = totalAllocatedExpenses > 0
    ? Math.round((totalSpentExpenses / totalAllocatedExpenses) * 100)
    : 0;

  // Days left in month
  const today = new Date();
  const lastDayOfMonth = new Date(period.year, period.month, 0).getDate();
  const { month: curMonth, year: curYear } = getCurrentYearMonth();
  const isCurrentMonth = period.year === curYear && period.month === curMonth;
  const daysLeft = isCurrentMonth
    ? Math.max(0, lastDayOfMonth - today.getDate())
    : period.year < curYear || (period.year === curYear && period.month < curMonth)
      ? 0
      : lastDayOfMonth;

  return (
    <div className="space-y-4">
      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
        {/* Left: Month nav */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPeriod(getPreviousMonth(period.year, period.month))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Month picker */}
          <div className="relative" ref={monthPickerRef}>
            <button
              onClick={() => {
                setPickerYear(period.year);
                setShowMonthPicker((v) => !v);
              }}
              className="flex items-center gap-1.5 text-sm font-semibold min-w-[130px] justify-center rounded-md px-2 py-1 hover:bg-muted transition-colors"
            >
              {monthName}
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", showMonthPicker && "rotate-180")} />
            </button>

            {showMonthPicker && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-50 rounded-lg border bg-card shadow-lg p-3 w-[260px]">
                {/* Year nav */}
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => setPickerYear((y) => y - 1)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-semibold">{pickerYear}</span>
                  <button
                    onClick={() => setPickerYear((y) => y + 1)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Month grid */}
                <div className="grid grid-cols-3 gap-1">
                  {Array.from({ length: 12 }, (_, i) => {
                    const m = i + 1;
                    const label = new Date(pickerYear, i).toLocaleString("default", { month: "short" });
                    const isSelected = pickerYear === period.year && m === period.month;
                    const { month: curMonth, year: curYear } = getCurrentYearMonth();
                    const isCurrent = pickerYear === curYear && m === curMonth;

                    return (
                      <button
                        key={m}
                        onClick={() => {
                          setPeriod({ year: pickerYear, month: m });
                          setShowMonthPicker(false);
                        }}
                        className={cn(
                          "text-xs py-1.5 px-2 rounded-md transition-colors font-medium",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : isCurrent
                              ? "bg-muted font-semibold ring-1 ring-primary/30"
                              : "hover:bg-muted text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Today shortcut */}
                <button
                  onClick={() => {
                    const { month, year } = getCurrentYearMonth();
                    setPeriod({ year, month });
                    setShowMonthPicker(false);
                  }}
                  className="mt-2 w-full text-xs text-center py-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  Go to current month
                </button>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPeriod(getNextMonth(period.year, period.month))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Badge
            variant={visibility === "SHARED" ? "shared" : "personal"}
            className="text-[10px] ml-1"
          >
            {visibility === "SHARED" ? t(lang, "common.shared") : t(lang, "common.personal")}
          </Badge>
        </div>

        {/* Right: Copy Last Month */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() =>
            copyPreviousMonthMutation.mutate({
              month: period.month,
              year: period.year,
              visibility,
            })
          }
          disabled={copyPreviousMonthMutation.isPending}
        >
          <Copy className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {copyPreviousMonthMutation.isPending ? t(lang, "common.loading") : `${t(lang, "tracker.copyFrom")} ${new Date(period.year, period.month - 2).toLocaleString("default", { month: "long" })}`}
          </span>
          <span className="sm:hidden">
            {copyPreviousMonthMutation.isPending ? "..." : t(lang, "tracker.copyFrom")}
          </span>
        </Button>
      </div>

      {/* ── Budget Health Scorecard ──────────────────────────────── */}
      {summary && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t(lang, "tracker.budgetHealth")}
            </span>
          </div>

          {/* Top stats row */}
          <div className={cn("grid gap-4", totalFundContributions > 0 ? "grid-cols-4" : "grid-cols-3")}>
            <div>
              <div className="text-xs text-muted-foreground">{t(lang, "tracker.income")}</div>
              <MoneyDisplay
                amount={totalIncome}
                colorize={false}
                className="text-lg font-bold"
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t(lang, "tracker.funds.expenses")}</div>
              <MoneyDisplay
                amount={totalAllocatedExpenses}
                colorize={false}
                className="text-lg font-bold"
              />
            </div>
            {totalFundContributions > 0 && (
              <div>
                <div className="text-xs text-muted-foreground">{t(lang, "tracker.funds")}</div>
                <MoneyDisplay
                  amount={totalFundContributions}
                  colorize={false}
                  className="text-lg font-bold"
                />
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground">{t(lang, "tracker.leftToAssign")}</div>
              <MoneyDisplay
                amount={readyToAssign}
                colorize={false}
                className={cn(
                  "text-lg font-bold",
                  readyToAssign === 0 && incomeAssigned > 0 && "text-green-600 dark:text-green-400",
                  readyToAssign > 0 && "text-amber-600 dark:text-amber-400",
                  readyToAssign < 0 && "text-red-600 dark:text-red-400"
                )}
              />
              {readyToAssign === 0 && incomeAssigned > 0 && (
                <span className="text-[11px] text-green-600 dark:text-green-400 font-medium">{t(lang, "tracker.balanced")}</span>
              )}
              {readyToAssign > 0 && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400">{t(lang, "tracker.unassigned")}</span>
              )}
              {readyToAssign < 0 && (
                <span className="text-[11px] text-red-600 dark:text-red-400">{t(lang, "tracker.overAllocated")}</span>
              )}
            </div>
          </div>

          {/* Allocation progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t(lang, "tracker.allocated")}</span>
              <span>{allocationPct}% {t(lang, "tracker.assigned")}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  readyToAssign === 0 && incomeAssigned > 0
                    ? "bg-green-500"
                    : readyToAssign < 0
                      ? "bg-red-500"
                      : "bg-amber-500"
                )}
                style={{ width: `${Math.min(allocationPct, 100)}%` }}
              />
            </div>
          </div>

          {/* Spending progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {t(lang, "tracker.spent")}: <MoneyDisplay amount={totalSpentExpenses} colorize={false} className="text-xs font-medium inline" />
                {totalAllocatedExpenses > 0 && <> / <MoneyDisplay amount={totalAllocatedExpenses} colorize={false} className="text-xs inline" /> ({spendingPct}%)</>}
              </span>
              {isCurrentMonth && (
                <span>{daysLeft} {t(lang, "tracker.daysLeft")}</span>
              )}
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  spendingPct >= 100
                    ? "bg-red-500"
                    : spendingPct >= 80
                      ? "bg-yellow-500"
                      : "bg-green-500"
                )}
                style={{ width: `${Math.min(spendingPct, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Tracker Tables ───────────────────────────────────────── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={isEditing ? undefined : handleDragStart}
        onDragEnd={isEditing ? undefined : handleDragEnd}
      >
      {(["INCOME", "EXPENSE"] as const).map((tableType) => {
        const groups = tableType === "INCOME" ? incomeGroups : expenseGroups;
        const sortIds = tableType === "INCOME" ? incomeSortableIds : expenseSortableIds;
        const isIncome = tableType === "INCOME";
        const tableTitle = isIncome ? `💰 ${t(lang, "tracker.income")}` : `📊 ${t(lang, "tracker.expenses")}`;
        const tableTotalBudget = isIncome ? incomeAssigned : expenseAssigned;
        const tableTotalActual = isIncome ? totalIncomeActual : -totalSpentExpenses;
        const tableTotalAvail = isIncome
          ? incomeAssigned - totalIncomeActual
          : expenseAssigned - totalSpentExpenses;

        return (
          <div key={tableType} className="rounded-lg border bg-card overflow-x-clip">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="sticky top-16 z-10">
                <tr className="border-b bg-card">
                  <th colSpan={4} className="text-left py-2.5 px-4 bg-card">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {tableTitle}
                    </span>
                  </th>
                </tr>
                <tr className="border-b bg-card">
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider bg-card">
                    {isIncome ? t(lang, "tracker.income") : t(lang, "tracker.expenses")}
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-32 bg-card">
                    Budget
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-32 bg-card">
                    Actual
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-36 bg-card">
                    Available
                  </th>
                </tr>
              </thead>

              <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
              <tbody>

                {groups.map((group) => {
                  const groupRemaining = group.totalAllocated - group.totalSpent;
                  const isCollapsed = collapsedGroups.has(group.id);
                  const isIncomeGroup = group.type === "INCOME";
                  const isEditingGroup = editingCategoryId === group.id;

                  return (
                    <GroupRows key={group.id}>
                      {/* Group header row */}
                      <SortableTr
                        id={`group-${group.id}`}
                        className={cn(
                          "border-b select-none group/row",
                          isIncomeGroup
                            ? "bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-100/50 dark:hover:bg-blue-950/30"
                            : "bg-muted/30 hover:bg-muted/50"
                        )}
                      >
                        {(dragHandleProps) => (<>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <DragHandle
                              listeners={dragHandleProps}
                              className="opacity-0 group-hover/row:opacity-100 transition-opacity"
                            />
                            <span
                              className="cursor-pointer"
                              onClick={() => toggleGroup(group.id)}
                            >
                              <ChevronRight
                                className={cn(
                                  "h-4 w-4 text-muted-foreground transition-transform",
                                  !isCollapsed && "rotate-90"
                                )}
                              />
                            </span>

                            {isEditingGroup ? (
                              <form
                                className="flex items-center gap-2 flex-1"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  if (editingName.trim()) {
                                    updateCategoryMutation.mutate({
                                      id: group.id,
                                      name: editingName.trim(),
                                      icon: editingIcon.trim() || undefined,
                                      type: editingGroupType,
                                    });
                                    setIconSuggestions([]);
                                  }
                                }}
                              >
                                <EmojiPickerButton
                                  value={editingIcon}
                                  onChange={(emoji) => setEditingIcon(emoji)}
                                />
                                <input
                                  autoFocus
                                  value={editingName}
                                  onChange={(e) => { setEditingName(e.target.value); triggerIconSuggestion(e.target.value); }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") {
                                      setEditingCategoryId(null);
                                      setEditingName("");
                                      setIconSuggestions([]);
                                    }
                                  }}
                                  className="bg-transparent border-0 border-b border-primary/50 outline-none font-semibold text-sm py-0 px-1 w-full max-w-[200px]"
                                />
                                <button
                                  type="button"
                                  onClick={() => setEditingGroupType((t) => t === "INCOME" ? "EXPENSE" : "INCOME")}
                                  className={cn(
                                    "text-xs px-2 py-0.5 rounded-full border transition-colors shrink-0",
                                    editingGroupType === "INCOME"
                                      ? "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                                      : "border-muted text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  {editingGroupType === "INCOME" ? "Income" : "Expense"}
                                </button>
                                <button
                                  type="submit"
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCategoryId(null);
                                    setEditingName("");
                                    setIconSuggestions([]);
                                  }}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </form>
                            ) : (
                              <>
                                <span
                                  className="text-sm cursor-pointer"
                                  onClick={() => toggleGroup(group.id)}
                                >
                                  {group.icon}
                                </span>
                                <span
                                  className={cn(
                                    "font-semibold cursor-pointer",
                                    isIncomeGroup && "text-blue-700 dark:text-blue-300"
                                  )}
                                  onClick={() => toggleGroup(group.id)}
                                >
                                  {group.name}
                                </span>
                                <button
                                  onClick={() => {
                                    setEditingCategoryId(group.id);
                                    setEditingName(group.name);
                                    setEditingIcon(group.icon ?? "");
                                    setEditingGroupType(group.type);
                                    setIconSuggestions([]);
                                    if (group.name.trim().length >= 2) {
                                      suggestIconMutation.mutate({ name: group.name.trim() });
                                    }
                                  }}
                                  className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground opacity-0 group-hover/row:opacity-100 transition-opacity"
                                  title="Rename group"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => setAddingCategoryToGroup(group.id)}
                                    className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                                    title="Add subcategory"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                  {group.childCount === 0 && (
                                    <button
                                      onClick={() =>
                                        deleteCategoryMutation.mutate({ id: group.id })
                                      }
                                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-600"
                                      title="Delete empty group"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </td>

                        {!isEditingGroup ? (
                          <>
                            <td
                              className="py-2 px-3 text-right cursor-pointer"
                              onClick={() => toggleGroup(group.id)}
                            >
                              {group.totalAllocated === 0
                                ? <span className="text-sm text-muted-foreground/40">—</span>
                                : <MoneyDisplay
                                    amount={group.totalAllocated}
                                    colorize={false}
                                    className="text-sm font-semibold"
                                  />
                              }
                            </td>
                            <td
                              className="py-2 px-3 text-right cursor-pointer"
                              onClick={() => toggleGroup(group.id)}
                            >
                              {(() => {
                                const groupActual = isIncomeGroup
                                  ? group.totalIncomeActual - group.totalExpenseActual
                                  : -group.totalSpent;
                                const hasActual = isIncomeGroup
                                  ? group.totalIncomeActual > 0 || group.totalExpenseActual > 0
                                  : group.totalSpent > 0;
                                return hasActual ? (
                                  <MoneyDisplay
                                    amount={groupActual}
                                    colorize={false}
                                    className={cn(
                                      "text-sm font-semibold",
                                      isIncomeGroup
                                        ? groupActual >= 0
                                          ? "text-green-600 dark:text-green-400"
                                          : "text-red-600 dark:text-red-400"
                                        : "text-red-600 dark:text-red-400"
                                    )}
                                  />
                                ) : (
                                  <span className="text-sm text-muted-foreground/40">—</span>
                                );
                              })()}
                            </td>
                            <td
                              className="py-2 px-3 text-right cursor-pointer"
                              onClick={() => toggleGroup(group.id)}
                            >
                              {isIncomeGroup ? (
                                <IncomeAvailableCell
                                  amount={group.totalAllocated - group.totalIncomeActual}
                                  allocated={group.totalAllocated}
                                  incomeActual={group.totalIncomeActual}
                                />
                              ) : (
                                <AvailableCell
                                  amount={groupRemaining}
                                  allocated={group.totalAllocated}
                                  spent={group.totalSpent}
                                />
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            <td />
                            <td />
                            <td />
                          </>
                        )}
                      </>)}
                      </SortableTr>
                      {/* Ophelia icon suggestions row for group edit */}
                      {editingCategoryId === group.id && (iconSuggestions.length > 0 || suggestIconMutation.isPending) && (
                        <tr className="border-b border-border/50 bg-muted/5">
                          <td className="py-1 px-3 pl-6" colSpan={4}>
                            <div className="flex items-center gap-1">
                              <Sparkles className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                              {suggestIconMutation.isPending ? (
                                <span className="text-xs text-muted-foreground/50 animate-pulse">Suggesting icons…</span>
                              ) : (
                                <>
                                  <span className="text-xs text-muted-foreground/50 mr-1">Ophelia suggests:</span>
                                  {iconSuggestions.map((emoji) => (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => {
                                        setEditingIcon(emoji);
                                        setIconSuggestions([]);
                                      }}
                                      className="text-lg leading-none px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
                                      title={`Use ${emoji}`}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Category rows */}
                      {!isCollapsed &&
                        group.children.map((cat) => {
                          const isEditingCat = editingCategoryId === cat.id;

                          return (
                            <React.Fragment key={cat.id}>
                            <SortableTr
                              id={`cat-${cat.id}`}
                              className={cn(
                                "border-b border-border/50 hover:bg-muted/20 group/catrow",
                                isEditingCat && (iconSuggestions.length > 0 || suggestIconMutation.isPending)
                                  ? "border-b-0"
                                  : getRowBorder(cat.remaining, cat.allocated, cat.spent)
                              )}
                            >
                              {(catDragHandleProps) => (<>
                              <td className="py-1.5 px-3">
                                {isEditingCat ? (
                                  <form
                                    className="flex items-center gap-2"
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      if (editingName.trim()) {
                                        updateCategoryMutation.mutate({
                                          id: cat.id,
                                          name: editingName.trim(),
                                          icon: editingIcon.trim() || undefined,
                                        });
                                        setIconSuggestions([]);
                                      }
                                    }}
                                  >
                                    <EmojiPickerButton
                                      value={editingIcon}
                                      onChange={(emoji) => setEditingIcon(emoji)}
                                    />
                                    {suggestIconMutation.isPending && isEditingCat && (
                                      <Sparkles className="h-3 w-3 text-muted-foreground/50 animate-pulse shrink-0" />
                                    )}
                                    <input
                                      autoFocus
                                      value={editingName}
                                      onChange={(e) => { setEditingName(e.target.value); triggerIconSuggestion(e.target.value); }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape") {
                                          setEditingCategoryId(null);
                                          setEditingName("");
                                          setIconSuggestions([]);
                                        }
                                      }}
                                      className="bg-transparent border-0 border-b border-primary/50 outline-none text-sm py-0 px-1 w-full max-w-[200px]"
                                    />
                                    <button
                                      type="submit"
                                      className="text-muted-foreground hover:text-foreground"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCategoryId(null);
                                        setEditingName("");
                                        setIconSuggestions([]);
                                      }}
                                      className="text-muted-foreground hover:text-foreground"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </form>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover/catrow:opacity-100 transition-opacity">
                                      <DragHandle
                                        listeners={catDragHandleProps}
                                      />
                                      <button
                                        onClick={() => {
                                          setEditingCategoryId(cat.id);
                                          setEditingName(cat.name);
                                          setEditingIcon(cat.icon ?? "");
                                          setIconSuggestions([]);
                                          if (cat.name.trim().length >= 2) {
                                            suggestIconMutation.mutate({ name: cat.name.trim() });
                                          }
                                        }}
                                        className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                                        title="Rename"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (cat.transactionCount > 0) {
                                            setDeleteCategoryTarget({
                                              id: cat.id,
                                              name: cat.name,
                                              icon: cat.icon,
                                              transactionCount: cat.transactionCount,
                                            });
                                          } else {
                                            deleteCategoryMutation.mutate({ id: cat.id });
                                          }
                                        }}
                                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-600"
                                        title="Delete category"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                    <span className="text-sm">{cat.icon}</span>
                                    <span
                                      className={cn(
                                        "text-sm",
                                        cat.allocated === 0 &&
                                          cat.spent === 0 &&
                                          "text-muted-foreground"
                                      )}
                                    >
                                      {cat.name}
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td className="py-1.5 px-3 text-right">
                                <InlineMoneyEdit
                                  key={`alloc-${tracker.id}-${cat.id}`}
                                  value={cat.allocated}
                                  onSave={(cents) => {
                                    setAllocationMutation.mutate({
                                      trackerId: tracker.id,
                                      categoryId: cat.id,
                                      amount: cents,
                                    });
                                  }}
                                />
                              </td>
                              <td className="py-1.5 px-3 text-right">
                                {(() => {
                                  const catActual = isIncomeGroup
                                    ? cat.incomeActual - cat.expenseActual
                                    : -cat.spent;
                                  const hasActual = isIncomeGroup
                                    ? cat.incomeActual > 0 || cat.expenseActual > 0
                                    : cat.spent > 0;
                                  return hasActual ? (
                                    <Link
                                      href={buildCategoryTransactionsUrl(cat.id, period)}
                                      className="hover:underline transition-colors"
                                      title="View transactions"
                                    >
                                      <MoneyDisplay
                                        amount={catActual}
                                        colorize={false}
                                        className={cn(
                                          "text-sm",
                                          isIncomeGroup
                                            ? catActual >= 0
                                              ? "text-green-600 dark:text-green-400"
                                              : "text-red-600 dark:text-red-400"
                                            : "text-red-600 dark:text-red-400"
                                        )}
                                      />
                                    </Link>
                                  ) : (
                                    <span className="text-sm text-muted-foreground/40">—</span>
                                  );
                                })()}
                              </td>
                              <td className="py-1.5 px-3 text-right">
                                {isIncomeGroup ? (
                                  <IncomeAvailableCell
                                    amount={cat.allocated - cat.incomeActual}
                                    allocated={cat.allocated}
                                    incomeActual={cat.incomeActual}
                                  />
                                ) : (
                                  <AvailableCell
                                    amount={cat.remaining}
                                    allocated={cat.allocated}
                                    spent={cat.spent}
                                  />
                                )}
                              </td>
                            </>)}
                            </SortableTr>
                            {/* Ophelia icon suggestions row for category edit */}
                            {isEditingCat && (iconSuggestions.length > 0 || suggestIconMutation.isPending) && (
                              <tr className="border-b border-border/50 bg-muted/5">
                                <td className="py-1 px-3 pl-6" colSpan={4}>
                                  <div className="flex items-center gap-1">
                                    <Sparkles className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                                    {suggestIconMutation.isPending ? (
                                      <span className="text-xs text-muted-foreground/50 animate-pulse">Suggesting icons…</span>
                                    ) : (
                                      <>
                                        <span className="text-xs text-muted-foreground/50 mr-1">Ophelia suggests:</span>
                                        {iconSuggestions.map((emoji) => (
                                          <button
                                            key={emoji}
                                            type="button"
                                            onClick={() => {
                                              setEditingIcon(emoji);
                                              setIconSuggestions([]);
                                            }}
                                            className="text-lg leading-none px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
                                            title={`Use ${emoji}`}
                                          >
                                            {emoji}
                                          </button>
                                        ))}
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                            </React.Fragment>
                          );
                        })}

                      {/* Add category inline row */}
                      {!isCollapsed && addingCategoryToGroup === group.id && (
                        <>
                        <tr className={cn("bg-muted/10", iconSuggestions.length > 0 || suggestIconMutation.isPending ? "" : "border-b border-border/50")}>
                          <td className="py-1.5 px-3 pl-6" colSpan={4}>
                            <form
                              className="flex items-center gap-2"
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (newCategoryName.trim()) {
                                  createCategoryMutation.mutate({
                                    name: newCategoryName.trim(),
                                    parentId: group.id,
                                    visibility,
                                    icon: newCategoryIcon.trim() || undefined,
                                  });
                                  setIconSuggestions([]);
                                }
                              }}
                            >
                              <EmojiPickerButton
                                value={newCategoryIcon}
                                onChange={(emoji) => setNewCategoryIcon(emoji)}
                              />
                              {suggestIconMutation.isPending && addingCategoryToGroup === group.id && (
                                <Sparkles className="h-3 w-3 text-muted-foreground/50 animate-pulse shrink-0" />
                              )}
                              <input
                                autoFocus
                                placeholder="New category name..."
                                value={newCategoryName}
                                onChange={(e) => { setNewCategoryName(e.target.value); triggerIconSuggestion(e.target.value); }}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") {
                                    setAddingCategoryToGroup(null);
                                    setNewCategoryName("");
                                    setNewCategoryIcon("");
                                    setIconSuggestions([]);
                                  }
                                }}
                                className="bg-transparent border-0 border-b border-primary/50 outline-none text-sm py-0 px-1 flex-1 max-w-[250px]"
                              />
                              <button
                                type="submit"
                                disabled={
                                  !newCategoryName.trim() || createCategoryMutation.isPending
                                }
                                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setAddingCategoryToGroup(null);
                                  setNewCategoryName("");
                                  setNewCategoryIcon("");
                                  setIconSuggestions([]);
                                }}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </form>
                          </td>
                        </tr>
                        {/* Ophelia icon suggestions row for new category */}
                        {(iconSuggestions.length > 0 || suggestIconMutation.isPending) && addingCategoryToGroup === group.id && (
                          <tr className="border-b border-border/50 bg-muted/5">
                            <td className="py-1 px-3 pl-6" colSpan={4}>
                              <div className="flex items-center gap-1">
                                <Sparkles className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                                {suggestIconMutation.isPending ? (
                                  <span className="text-xs text-muted-foreground/50 animate-pulse">Suggesting icons…</span>
                                ) : (
                                  <>
                                    <span className="text-xs text-muted-foreground/50 mr-1">Ophelia suggests:</span>
                                    {iconSuggestions.map((emoji) => (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => {
                                          setNewCategoryIcon(emoji);
                                          setIconSuggestions([]);
                                        }}
                                        className="text-lg leading-none px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
                                        title={`Use ${emoji}`}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        </>
                      )}
                    </GroupRows>
                  );
                })}
              </tbody>
              </SortableContext>

              {/* Unbudgeted spending — expenses only */}
              {!isIncome && (unbudgetedCategories.length > 0 || (uncategorizedEntry && uncategorizedEntry.spent > 0)) && (
                <tbody>
                  <tr className="border-t-2 border-dashed border-amber-500/50">
                    <td colSpan={4} className="py-1.5 px-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                          {t(lang, "tracker.unbudgeted")}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {uncategorizedEntry && uncategorizedEntry.spent > 0 && (
                    <tr className="border-b border-border/50 bg-amber-50/30 dark:bg-amber-950/10">
                      <td className="py-1.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">📄</span>
                          <span className="text-sm text-muted-foreground">Uncategorized</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <span className="text-sm text-muted-foreground/40">—</span>
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <Link
                          href={(() => {
                            const mm = String(period.month).padStart(2, "0");
                            const ld = new Date(period.year, period.month, 0).getDate();
                            return `/transactions?accrualDateFrom=${period.year}-${mm}-01&accrualDateTo=${period.year}-${mm}-${String(ld).padStart(2, "0")}&liquidOnly=true`;
                          })()}
                          className="hover:underline transition-colors"
                          title="View uncategorized transactions"
                        >
                          <MoneyDisplay
                            amount={-uncategorizedEntry.spent}
                            colorize={false}
                            className="text-sm text-red-600 dark:text-red-400"
                          />
                        </Link>
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <AvailableCell
                          amount={-uncategorizedEntry.spent}
                          allocated={0}
                          spent={uncategorizedEntry.spent}
                        />
                      </td>
                    </tr>
                  )}
                  {unbudgetedCategories.map((cat) => (
                    <tr key={cat.id} className="border-b border-border/50 bg-amber-50/30 dark:bg-amber-950/10">
                      <td className="py-1.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{cat.icon}</span>
                          <span className="text-sm text-muted-foreground">{cat.name}</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <span className="text-sm text-muted-foreground/40">—</span>
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <Link
                          href={buildCategoryTransactionsUrl(cat.id, period)}
                          className="hover:underline transition-colors"
                          title="View transactions"
                        >
                          <MoneyDisplay
                            amount={-cat.spent}
                            colorize={false}
                            className="text-sm text-red-600 dark:text-red-400"
                          />
                        </Link>
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <AvailableCell
                          amount={-cat.spent}
                          allocated={0}
                          spent={cat.spent}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              )}

              {/* Summary + Add Group */}
              <tfoot>
                {/* Total row */}
                {groups.length > 0 && (
                  <tr className="border-t bg-muted/30 text-xs font-medium">
                    <td className="py-2 px-3 text-muted-foreground">
                      {isIncome ? t(lang, "tracker.totalIncome") : t(lang, "tracker.totalExpenses")}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {tableTotalBudget === 0
                        ? <span className="text-xs text-muted-foreground/40">—</span>
                        : <MoneyDisplay amount={tableTotalBudget} colorize={false} className="text-xs font-semibold" />
                      }
                    </td>
                    <td className="py-2 px-3 text-right">
                      {(() => {
                        const hasActual = isIncome
                          ? (incomeGroups.some(g => g.totalIncomeActual > 0 || g.totalExpenseActual > 0))
                          : totalSpentExpenses > 0;
                        return hasActual ? (
                          <MoneyDisplay
                            amount={tableTotalActual}
                            colorize={false}
                            className={cn(
                              "text-xs font-semibold",
                              isIncome
                                ? tableTotalActual >= 0
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-red-600 dark:text-red-400"
                                : "text-red-600 dark:text-red-400"
                            )}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        );
                      })()}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {isIncome ? (
                        <IncomeAvailableCell
                          amount={tableTotalAvail}
                          allocated={tableTotalBudget}
                          incomeActual={totalIncomeActual}
                        />
                      ) : (
                        <AvailableCell
                          amount={tableTotalAvail}
                          allocated={tableTotalBudget}
                          spent={totalSpentExpenses}
                        />
                      )}
                    </td>
                  </tr>
                )}

                {/* Add group button/form */}
                {showAddGroup === tableType ? (
                  <tr className="border-t">
                    <td className="py-2 px-3" colSpan={4}>
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (newGroupName.trim()) {
                            createCategoryMutation.mutate({
                              name: newGroupName.trim(),
                              parentId: null,
                              visibility,
                              type: tableType,
                              icon: newGroupIcon.trim() || undefined,
                            });
                          }
                        }}
                      >
                        <input
                          value={newGroupIcon}
                          onChange={(e) => setNewGroupIcon(e.target.value)}
                          placeholder="📁"
                          maxLength={2}
                          className="w-8 text-center bg-transparent border-0 border-b border-primary/50 outline-none text-sm py-0"
                        />
                        <input
                          autoFocus
                          placeholder="New group name..."
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setShowAddGroup(null);
                              setNewGroupName("");
                              setNewGroupIcon("");
                            }
                          }}
                          className="bg-transparent border-0 border-b border-primary/50 outline-none text-sm font-semibold py-0 px-1 flex-1 max-w-[300px]"
                        />
                        <button
                          type="submit"
                          disabled={!newGroupName.trim() || createCategoryMutation.isPending}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddGroup(null);
                            setNewGroupName("");
                            setNewGroupIcon("");
                          }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr className="border-t">
                    <td className="py-2 px-3" colSpan={4}>
                      <button
                        onClick={() => setShowAddGroup(tableType)}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                        {isIncome ? t(lang, "tracker.addIncomeGroup") : t(lang, "tracker.addExpenseGroup")}
                      </button>
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>

            {/* Error display for category mutations */}
            {(createCategoryMutation.error ||
              updateCategoryMutation.error) && (
              <div className="px-3 py-2 text-sm text-red-600 border-t">
                {createCategoryMutation.error?.message ??
                  updateCategoryMutation.error?.message}
              </div>
            )}
          </div>
        );
      })}

      {/* DnD Overlay */}
      <DragOverlay dropAnimation={null}>
        {activeDragItem && (
          <table className="w-full text-sm border-collapse">
            <tbody>
              {activeDragItem.type === "group" ? (
                <tr className="bg-card shadow-lg ring-2 ring-primary/30 rounded">
                  <td className="py-2 px-3" colSpan={4}>
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">{activeDragItem.data.icon}</span>
                      <span className="font-semibold">{activeDragItem.data.name}</span>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr className="bg-card shadow-lg ring-2 ring-primary/30 rounded">
                  <td className="py-1.5 px-3 pl-6" colSpan={4}>
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">{activeDragItem.data.icon}</span>
                      <span className="text-sm">{activeDragItem.data.name}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </DragOverlay>
      </DndContext>

      {/* ── Funds Section (table format matching budget tracker) ──── */}
      {fundsQuery.data && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => setActiveDragId(event.active.id as string)}
          onDragEnd={(event) => {
            setActiveDragId(null);
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            const activeStr = active.id as string;
            const overStr = over.id as string;
            if (activeStr.startsWith("fund-") && overStr.startsWith("fund-")) {
              const activeFundId = activeStr.replace("fund-", "");
              const overFundId = overStr.replace("fund-", "");
              const oldIdx = fundsData.findIndex((f) => f.id === activeFundId);
              const newIdx = fundsData.findIndex((f) => f.id === overFundId);
              if (oldIdx === -1 || newIdx === -1) return;
              const reordered = arrayMove(fundsData, oldIdx, newIdx);
              reorderFundsMutation.mutate({
                items: reordered.map((f, i) => ({ id: f.id, sortOrder: i })),
              });
            }
          }}
        >
        <div className="rounded-lg border bg-card overflow-x-clip">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b bg-card">
                  <th colSpan={4} className="text-left py-2.5 px-4 bg-card">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">💰 {t(lang, "tracker.funds")}</span>
                      <button
                        onClick={() => setShowAddFund(true)}
                        className="p-0.5 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                        title={t(lang, "tracker.funds.addFund")}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </th>
                </tr>
                <tr className="border-b bg-card">
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider bg-card">
                    {t(lang, "tracker.funds")}
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-32 bg-card">
                    Budget
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-32 bg-card">
                    Actual
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-36 bg-card">
                    Available
                  </th>
                </tr>
              </thead>
              <SortableContext
                items={fundsData.map((f) => `fund-${f.id}`)}
                strategy={verticalListSortingStrategy}
              >
              <tbody>

                {/* Fund rows */}
                {fundsData.length === 0 && !showAddFund ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-sm text-muted-foreground/50">
                      No funds yet. Create one to start envelope budgeting.
                    </td>
                  </tr>
                ) : (
                  <>
                    {fundsData.map((fund) => {
                      const isEditingThisFund = editingFundId === fund.id;

                      return (
                        <React.Fragment key={fund.id}>
                        <SortableTr
                          id={`fund-${fund.id}`}
                          className={cn(
                            "border-b border-border/50 hover:bg-muted/20 group/catrow",
                            isEditingThisFund && (fundIconSuggestions.length > 0 || suggestFundIconMutation.isPending)
                              ? "border-b-0"
                              : getRowBorder(fund.available, fund.budget, fund.thisMonthActual)
                          )}
                        >
                          {(fundDragHandleProps) => (<>
                          <td className="py-1.5 px-3">
                            {isEditingThisFund ? (
                              <form
                                className="flex items-center gap-2"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  if (editingFundName.trim()) {
                                    updateFundMutation.mutate({
                                      id: fund.id,
                                      name: editingFundName.trim(),
                                      icon: editingFundIcon.trim() || undefined,
                                    });
                                  }
                                }}
                              >
                                <EmojiPickerButton
                                  value={editingFundIcon}
                                  onChange={(emoji) => setEditingFundIcon(emoji)}
                                />
                                {suggestFundIconMutation.isPending && isEditingThisFund && (
                                  <Sparkles className="h-3 w-3 text-muted-foreground/50 animate-pulse shrink-0" />
                                )}
                                <input
                                  autoFocus
                                  value={editingFundName}
                                  onChange={(e) => { setEditingFundName(e.target.value); triggerFundIconSuggestion(e.target.value); }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") {
                                      setEditingFundId(null);
                                      setEditingFundName("");
                                      setEditingFundIcon("");
                                      setFundIconSuggestions([]);
                                    }
                                  }}
                                  className="bg-transparent border-0 border-b border-primary/50 outline-none text-sm py-0 px-1 w-full max-w-[200px]"
                                />
                                <button type="submit" className="text-muted-foreground hover:text-foreground">
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setEditingFundId(null); setEditingFundName(""); setEditingFundIcon(""); setFundIconSuggestions([]); }}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </form>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-0.5 opacity-0 group-hover/catrow:opacity-100 transition-opacity">
                                  <DragHandle
                                    listeners={fundDragHandleProps}
                                  />
                                  <button
                                    onClick={() => {
                                      setEditingFundId(fund.id);
                                      setEditingFundName(fund.name);
                                      setEditingFundIcon(fund.icon ?? "");
                                      setFundIconSuggestions([]);
                                      if (fund.name.trim().length >= 2) {
                                        suggestFundIconMutation.mutate({ name: fund.name.trim() });
                                      }
                                    }}
                                    className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                                    title="Rename"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => deleteFundMutation.mutate({ id: fund.id })}
                                    className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-600"
                                    title="Delete fund"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                                {fund.icon && <span className="text-sm">{fund.icon}</span>}
                                <span className={cn("text-sm", fund.budget === 0 && fund.thisMonthActual === 0 && "text-muted-foreground")}>
                                  {fund.name}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-right">
                            <InlineMoneyEdit
                              key={`fund-alloc-${tracker.id}-${fund.id}`}
                              value={fund.budget}
                              onSave={(cents) => {
                                setFundAllocationMutation.mutate({
                                  trackerId: tracker.id,
                                  fundId: fund.id,
                                  amount: cents,
                                });
                              }}
                              editingPrefix={
                                <button
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault(); // prevent blur on the input
                                    setCalculatorFundId(fund.id);
                                  }}
                                  className={cn(
                                    "p-0.5 rounded shrink-0",
                                    fund.lineItems.length > 0
                                      ? "text-primary hover:text-primary/80"
                                      : "text-muted-foreground/40 hover:text-foreground"
                                  )}
                                  title={t(lang, "tracker.funds.calculator")}
                                >
                                  <Calculator className="h-3.5 w-3.5" />
                                </button>
                              }
                            />
                          </td>
                          <td className="py-1.5 px-3 text-right">
                            {fund.thisMonthActual > 0 ? (
                              <Link href={buildFundTransactionsUrl(fund.id, period)}>
                                <MoneyDisplay amount={-fund.thisMonthActual} className="text-sm font-mono tabular-nums" />
                              </Link>
                            ) : (
                              <span className="text-sm text-muted-foreground/40">—</span>
                            )}
                          </td>
                          <td
                            className="py-1.5 px-3 text-right cursor-pointer"
                            onClick={() => setExpandedFundId(expandedFundId === fund.id ? null : fund.id)}
                            title="Click to see breakdown"
                          >
                            <AvailableCell
                              amount={fund.available}
                              allocated={fund.budget}
                              spent={fund.thisMonthActual}
                            />
                          </td>
                          </>)}
                        </SortableTr>
                        {/* Ophelia icon suggestions row for fund edit */}
                        {isEditingThisFund && (fundIconSuggestions.length > 0 || suggestFundIconMutation.isPending) && (
                          <tr className="border-b border-border/50 bg-muted/5">
                            <td className="py-1 px-3 pl-6" colSpan={4}>
                              <div className="flex items-center gap-1">
                                <Sparkles className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                                {suggestFundIconMutation.isPending ? (
                                  <span className="text-xs text-muted-foreground/50 animate-pulse">Suggesting icons…</span>
                                ) : (
                                  <>
                                    <span className="text-xs text-muted-foreground/50 mr-1">Ophelia suggests:</span>
                                    {fundIconSuggestions.map((emoji) => (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => {
                                          setEditingFundIcon(emoji);
                                          setFundIconSuggestions([]);
                                        }}
                                        className="text-lg leading-none px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
                                        title={`Use ${emoji}`}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        {/* Expanded detail: balance breakdown + adjustment history */}
                        {expandedFundId === fund.id && (
                          <tr className="border-b border-border/50 bg-muted/5">
                            <td colSpan={4} className="py-2 px-6">
                              <div className="space-y-2 max-w-lg">
                                {/* Balance breakdown */}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                                  <span className="text-muted-foreground">Total budgeted (all months)</span>
                                  <span className="text-right font-mono tabular-nums"><MoneyDisplay amount={fund.totalBudgeted} colorize={false} className="text-xs inline" /></span>
                                  <span className="text-muted-foreground">Total spending</span>
                                  <span className="text-right font-mono tabular-nums text-red-600 dark:text-red-400"><MoneyDisplay amount={-fund.totalSpending} colorize={false} className="text-xs inline" /></span>
                                  {fund.adjustments !== 0 && (
                                    <>
                                      <span className="text-muted-foreground">Adjustments total</span>
                                      <span className="text-right font-mono tabular-nums"><MoneyDisplay amount={fund.adjustments} colorize={false} className="text-xs inline" /></span>
                                    </>
                                  )}
                                  <span className="text-muted-foreground font-medium border-t pt-0.5 mt-0.5">Available</span>
                                  <span className="text-right font-mono tabular-nums font-medium border-t pt-0.5 mt-0.5"><MoneyDisplay amount={fund.available} colorize={false} className="text-xs inline" /></span>
                                </div>

                                {/* Adjustment entries list */}
                                {fund.entries.length > 0 && (
                                  <div className="space-y-0.5 pt-1 border-t">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t(lang, "tracker.funds.adjustment")}s</span>
                                    </div>
                                    <div className="max-h-32 overflow-y-auto space-y-0.5">
                                      {fund.entries.map((entry) => (
                                        <div
                                          key={entry.id}
                                          className="flex items-center justify-between py-0.5 px-1 rounded text-xs hover:bg-muted/30 group/entry"
                                        >
                                          <div className="flex items-center gap-2">
                                            <span className={cn("font-mono tabular-nums font-medium", entry.amount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                                              {entry.amount >= 0 ? "+" : ""}
                                              <MoneyDisplay amount={entry.amount} colorize={false} className="text-xs inline" />
                                            </span>
                                            {entry.note && (
                                              <span className="text-muted-foreground/60 truncate max-w-[150px]">— {entry.note}</span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-muted-foreground/50 text-[10px]">
                                              {String(entry.month).padStart(2, "0")}/{entry.year}
                                            </span>
                                            <button
                                              onClick={() => deleteFundEntryMutation.mutate({ entryId: entry.id })}
                                              className="opacity-0 group-hover/entry:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-600 transition-opacity"
                                              title="Delete adjustment"
                                            >
                                              <Trash2 className="h-3 w-3" />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Quick adjust button inside expanded view */}
                                {adjustingFundId !== fund.id && (
                                  <button
                                    onClick={() => {
                                      setAdjustingFundId(fund.id);
                                      setAdjustAmount("");
                                      setAdjustNote("");
                                    }}
                                    className="text-xs text-primary hover:underline flex items-center gap-1"
                                  >
                                    <Plus className="h-3 w-3" />
                                    {t(lang, "tracker.funds.adjust")}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        {/* Inline adjustment row */}
                        {adjustingFundId === fund.id && (
                          <tr className="border-b bg-muted/10">
                            <td colSpan={4} className="py-2 px-6">
                              <div className="flex items-center gap-2 max-w-md">
                                <span className="text-xs text-muted-foreground shrink-0">{t(lang, "tracker.funds.adjust")}:</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="e.g., 50.00 or -10.00"
                                  value={adjustAmount}
                                  onChange={(e) => setAdjustAmount(e.target.value)}
                                  className="h-7 w-28 rounded border bg-background px-2 text-xs"
                                  autoFocus
                                />
                                <input
                                  placeholder="Note (optional)"
                                  value={adjustNote}
                                  onChange={(e) => setAdjustNote(e.target.value)}
                                  className="h-7 flex-1 rounded border bg-background px-2 text-xs"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      const cents = toCents(parseFloat(adjustAmount) || 0);
                                      if (cents !== 0) {
                                        addFundEntryMutation.mutate({
                                          fundId: fund.id,
                                          amount: cents,
                                          note: adjustNote.trim() || undefined,
                                        });
                                      }
                                    }
                                    if (e.key === "Escape") setAdjustingFundId(null);
                                  }}
                                />
                                <button
                                  onClick={() => {
                                    const cents = toCents(parseFloat(adjustAmount) || 0);
                                    if (cents !== 0) {
                                      addFundEntryMutation.mutate({
                                        fundId: fund.id,
                                        amount: cents,
                                        note: adjustNote.trim() || undefined,
                                      });
                                    }
                                  }}
                                  className="text-xs text-primary hover:underline"
                                  disabled={addFundEntryMutation.isPending}
                                >
                                  {t(lang, "tracker.funds.apply")}
                                </button>
                                <button
                                  onClick={() => setAdjustingFundId(null)}
                                  className="text-xs text-muted-foreground"
                                >
                                  {t(lang, "common.cancel")}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </>
                )}

                {/* Inline add fund row */}
                {showAddFund && (
                  <>
                  <tr className={cn("border-b border-border/50", fundIconSuggestions.length > 0 || suggestFundIconMutation.isPending ? "border-b-0" : "")}>
                    <td className="py-1.5 px-3" colSpan={4}>
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (newFundName.trim()) {
                            createFundMutation.mutate({
                              name: newFundName.trim(),
                              icon: newFundIcon.trim() || undefined,
                              visibility,
                            });
                            setFundIconSuggestions([]);
                          }
                        }}
                      >
                        <EmojiPickerButton
                          value={newFundIcon}
                          onChange={(emoji) => setNewFundIcon(emoji)}
                        />
                        {suggestFundIconMutation.isPending && showAddFund && (
                          <Sparkles className="h-3 w-3 text-muted-foreground/50 animate-pulse shrink-0" />
                        )}
                        <input
                          autoFocus
                          value={newFundName}
                          onChange={(e) => { setNewFundName(e.target.value); triggerFundIconSuggestion(e.target.value); }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setShowAddFund(false);
                              setNewFundName("");
                              setNewFundIcon("");
                              setFundIconSuggestions([]);
                            }
                          }}
                          placeholder="Fund name..."
                          className="bg-transparent border-0 border-b border-primary/50 outline-none text-sm py-0 px-1 w-full max-w-[200px]"
                        />
                        <button type="submit" className="text-muted-foreground hover:text-foreground">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowAddFund(false); setNewFundName(""); setNewFundIcon(""); setFundIconSuggestions([]); }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </td>
                  </tr>
                  {/* Ophelia icon suggestions for new fund */}
                  {(fundIconSuggestions.length > 0 || suggestFundIconMutation.isPending) && showAddFund && (
                    <tr className="border-b border-border/50 bg-muted/5">
                      <td className="py-1 px-3 pl-6" colSpan={4}>
                        <div className="flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                          {suggestFundIconMutation.isPending ? (
                            <span className="text-xs text-muted-foreground/50 animate-pulse">Suggesting icons…</span>
                          ) : (
                            <>
                              <span className="text-xs text-muted-foreground/50 mr-1">Ophelia suggests:</span>
                              {fundIconSuggestions.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => {
                                    setNewFundIcon(emoji);
                                    setFundIconSuggestions([]);
                                  }}
                                  className="text-lg leading-none px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
                                  title={`Use ${emoji}`}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </>
                )}
              </tbody>
              </SortableContext>

              {/* Summary footer */}
              <tfoot>
                {fundsData.length > 0 && (
                  <>
                    <tr className="border-t bg-muted/30 text-xs font-medium">
                      <td className="py-2 px-3 text-muted-foreground">{t(lang, "tracker.funds.fundTotals")}</td>
                      <td className="py-2 px-3 text-right">
                        <MoneyDisplay amount={fundsData.reduce((s, f) => s + f.budget, 0)} colorize={false} className="text-xs font-semibold font-mono tabular-nums" />
                      </td>
                      <td className="py-2 px-3 text-right">
                        {(() => {
                          const totalActual = fundsData.reduce((s, f) => s + f.thisMonthActual, 0);
                          return totalActual > 0 ? (
                            <MoneyDisplay amount={-totalActual} className="text-xs font-semibold font-mono tabular-nums" />
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          );
                        })()}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <MoneyDisplay amount={fundsData.reduce((s, f) => s + f.available, 0)} colorize={false} className="text-xs font-semibold font-mono tabular-nums" />
                      </td>
                    </tr>
                    {(() => {
                      const linkedAccount = fundsData.find(f => f.linkedAccount)?.linkedAccount;
                      if (!linkedAccount) return null;
                      const fundTotal = fundsData.reduce((sum, f) => sum + f.available, 0);
                      const diff = historicalAccountBalance !== null ? Math.abs(historicalAccountBalance - fundTotal) : null;
                      const inSync = diff !== null && diff < 100;
                      return (
                        <>
                          <tr className="text-xs">
                            <td className="py-1 px-3 text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <span>Funds {t(lang, "tracker.funds.linkedTo")}:</span>
                                <select
                                  value={linkedAccount.id}
                                  onChange={(e) => {
                                    const accountId = e.target.value || null;
                                    updateLinkedAccountMutation.mutate({
                                      visibility,
                                      linkedAccountId: accountId,
                                    });
                                  }}
                                  className="h-5 rounded border bg-transparent px-1 text-xs"
                                >
                                  <option value="">None</option>
                                  {(accountsQuery.data ?? []).map((a: { id: string; name: string }) => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td colSpan={2} />
                            <td className="py-1 px-3">
                              <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 justify-end whitespace-nowrap">
                                {historicalAccountBalance !== null && (
                                  <>
                                    <span className="text-muted-foreground text-right">{t(lang, "tracker.funds.accountBalance")}</span>
                                    <MoneyDisplay amount={historicalAccountBalance} colorize={false} className="text-xs font-semibold font-mono tabular-nums text-right" />
                                  </>
                                )}
                                {diff !== null && (
                                  <>
                                    <span className="text-muted-foreground text-right">{t(lang, "tracker.funds.difference")}</span>
                                    <span className={cn("text-right text-xs font-medium", inSync ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400")}>
                                      {inSync ? `✅ ${t(lang, "tracker.funds.inSync")}` : (
                                        <>
                                          ⚠️ <MoneyDisplay amount={diff} colorize={false} className="text-xs inline" />
                                        </>
                                      )}
                                    </span>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        </>
                      );
                    })()}
                  </>
                )}
              </tfoot>
            </table>
        </div>
        </DndContext>
      )}

      {/* Delete Category Dialog */}
      <DeleteCategoryDialog
        category={deleteCategoryTarget}
        open={!!deleteCategoryTarget}
        onClose={() => setDeleteCategoryTarget(null)}
        categories={flatCategoriesForDelete}
        funds={fundsData.map((f) => ({ id: f.id, name: f.name, icon: f.icon }))}
        lang={lang}
      />

      {/* Fund Calculator Dialog */}
      {(() => {
        const calcFund = calculatorFundId ? fundsData.find(f => f.id === calculatorFundId) : null;
        return calcFund ? (
          <FundCalculator
            fundId={calcFund.id}
            fundName={calcFund.name}
            initialItems={calcFund.lineItems}
            open={!!calculatorFundId}
            onClose={() => setCalculatorFundId(null)}
            lang={lang}
            onApplyBudget={(computedMonthly) => {
              setFundAllocationMutation.mutate({
                trackerId: tracker.id,
                fundId: calcFund.id,
                amount: computedMonthly,
              });
            }}
          />
        ) : null;
      })()}

    </div>
  );
}

// ── Fragment wrapper for table row groups ─────────────────────────

function GroupRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ── Sortable table row wrapper (render-prop for listeners) ────────

function SortableTr({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: (dragHandleProps: Record<string, unknown>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging, transition } =
    useSortable({ id });

  return (
    <tr
      ref={setNodeRef}
      className={cn(className, isDragging && "opacity-40")}
      style={{ transition }}
      {...attributes}
    >
      {children(listeners ?? {})}
    </tr>
  );
}

// ── Drag handle component ─────────────────────────────────────────

function DragHandle({
  listeners,
  className,
}: {
  listeners: Record<string, unknown>;
  className?: string;
}) {
  return (
    <span
      {...listeners}
      className={cn(
        "cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted/80 text-muted-foreground",
        className
      )}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </span>
  );
}
