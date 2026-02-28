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
import { getCurrentYearMonth, getPreviousMonth, getNextMonth, formatShortDate } from "@/lib/date";
import { useOwnership } from "@/lib/ownership-context";
import { cn } from "@/lib/utils";
import { extractDisplayName } from "@/lib/recurring";
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
  CalendarDays,
  GripVertical,
  Repeat,
  CircleCheck,
  CircleDashed,
  CircleAlert,
  EyeOff,
  RotateCcw,
  Sparkles,
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

// ── Main Component ────────────────────────────────────────────────

export default function TrackerPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { visibilityParam } = useOwnership();

  const [period, setPeriod] = useState(getCurrentYearMonth());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Category management state
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [addingCategoryToGroup, setAddingCategoryToGroup] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("");
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupIcon, setNewGroupIcon] = useState("");
  const [editingIcon, setEditingIcon] = useState("");
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
        setShowAddGroup(false);
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


  // Recurring queries & mutations
  const recurringQuery = useQuery(
    trpc.recurring.listForMonth.queryOptions({
      month: period.month,
      year: period.year,
      visibility,
    })
  );

  const accountsQuery = useQuery(trpc.account.list.queryOptions());

  const detectQuery = useQuery(
    trpc.recurring.detect.queryOptions({ visibility })
  );

  const createRecurringMutation = useMutation(
    trpc.recurring.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setAddingRecurring(false);
        resetRecurringForm();
      },
    })
  );

  const updateRecurringMutation = useMutation(
    trpc.recurring.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setEditingRecurringId(null);
        resetRecurringForm();
      },
    })
  );

  const deleteRecurringMutation = useMutation(
    trpc.recurring.delete.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    })
  );

  const reapplyCategoryMutation = useMutation(
    trpc.recurring.reapplyCategory.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    })
  );

  const dismissPatternMutation = useMutation(
    trpc.recurring.dismiss.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    })
  );

  const undismissPatternMutation = useMutation(
    trpc.recurring.undismiss.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    })
  );

  // Recurring section state
  const [recurringSectionCollapsed, setRecurringSectionCollapsed] = useState(false);
  const [addingRecurring, setAddingRecurring] = useState(false);
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
  const [dismissedSubExpanded, setDismissedSubExpanded] = useState(false);
  const [collapsedRecurringGroups, setCollapsedRecurringGroups] = useState<Set<string>>(new Set());
  // Inactive sub-sections start collapsed — this tracks which are expanded
  const [expandedInactiveGroups, setExpandedInactiveGroups] = useState<Set<string>>(new Set());

  const toggleRecurringGroup = (groupId: string) => {
    setCollapsedRecurringGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleInactiveGroup = (groupId: string) => {
    setExpandedInactiveGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // Compute new vs dismissed detected patterns (from server state)
  const newPatterns = useMemo(() => {
    if (!detectQuery.data) return [];
    const dismissed = new Set(detectQuery.data.dismissedKeys);
    return detectQuery.data.patterns.filter((p) => !dismissed.has(p.key));
  }, [detectQuery.data]);

  const dismissedPatterns = useMemo(() => {
    if (!detectQuery.data) return [];
    const dismissed = new Set(detectQuery.data.dismissedKeys);
    return detectQuery.data.patterns.filter((p) => dismissed.has(p.key));
  }, [detectQuery.data]);

  // Group recurring rules by category
  const recurringGroups = useMemo(() => {
    if (!recurringQuery.data) return [];

    const activeRules = recurringQuery.data.rules;
    const inactiveRules = recurringQuery.data.inactiveRules ?? [];

    type ActiveRule = (typeof activeRules)[number];
    type InactiveRule = (typeof inactiveRules)[number];

    const groupMap = new Map<
      string,
      {
        categoryId: string | null;
        categoryName: string;
        categoryIcon: string | null;
        activeRules: ActiveRule[];
        inactiveRules: InactiveRule[];
      }
    >();

    for (const rule of activeRules) {
      const key = rule.categoryId ?? "__uncategorized__";
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          categoryId: rule.categoryId,
          categoryName: rule.category?.name ?? "Other",
          categoryIcon: rule.category?.icon ?? null,
          activeRules: [],
          inactiveRules: [],
        });
      }
      groupMap.get(key)!.activeRules.push(rule);
    }

    for (const rule of inactiveRules) {
      const key = rule.categoryId ?? "__uncategorized__";
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          categoryId: rule.categoryId,
          categoryName: rule.category?.name ?? "Other",
          categoryIcon: rule.category?.icon ?? null,
          activeRules: [],
          inactiveRules: [],
        });
      }
      groupMap.get(key)!.inactiveRules.push(rule);
    }

    // Sort: groups with overdue/pending active rules first, uncategorized last
    return [...groupMap.values()].sort((a, b) => {
      if (a.categoryId === null && b.categoryId !== null) return 1;
      if (b.categoryId === null && a.categoryId !== null) return -1;
      return a.categoryName.localeCompare(b.categoryName);
    });
  }, [recurringQuery.data]);
  const [recurringForm, setRecurringForm] = useState({
    name: "",
    description: "",
    amount: "",
    type: "EXPENSE" as "INCOME" | "EXPENSE",
    frequency: "MONTHLY" as "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY",
    startDate: new Date().toISOString().slice(0, 10),
    totalInstallments: "",
    categoryId: "",
    accountId: "",
  });

  function resetRecurringForm() {
    setRecurringForm({
      name: "",
      description: "",
      amount: "",
      type: "EXPENSE",
      frequency: "MONTHLY",
      startDate: new Date().toISOString().slice(0, 10),
      totalInstallments: "",
      categoryId: "",
      accountId: "",
    });
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

  // ── DnD: build flat sortable ID list ──
  const sortableIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groupsWithData) {
      ids.push(`group-${group.id}`);
      if (!collapsedGroups.has(group.id)) {
        for (const cat of group.children) {
          ids.push(`cat-${cat.id}`);
        }
      }
    }
    return ids;
  }, [groupsWithData, collapsedGroups]);

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


  // Compute Ready to Assign from income vs expense allocations
  const incomeAssigned = groupsWithData
    .filter((g) => g.type === "INCOME")
    .reduce((sum, g) => sum + g.totalAllocated, 0);
  const expenseAssigned = groupsWithData
    .filter((g) => g.type === "EXPENSE")
    .reduce((sum, g) => sum + g.totalAllocated, 0);
  const readyToAssign = incomeAssigned - expenseAssigned;

  // Actual Balance: real income received − real expenses paid (from transactions)
  const actualBalance = (summary?.actualIncome ?? 0) - (summary?.totalActualExpenses ?? 0);

  const uncategorizedEntry = summaryCategories.find((c) => !c.categoryId);


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
            {visibility === "SHARED" ? "Shared" : "Personal"}
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
            {copyPreviousMonthMutation.isPending ? "Copying..." : "Copy Last Month"}
          </span>
          <span className="sm:hidden">
            {copyPreviousMonthMutation.isPending ? "..." : "Copy"}
          </span>
        </Button>
      </div>

      {/* ── Tracker Grid ────────────────────────────────────────── */}
      <DndContext
        sensors={isEditing ? [] : sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
      <div className="rounded-lg border bg-card overflow-x-clip">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="sticky top-16 z-10">
            <tr className="border-b bg-muted/50">
              <th className="text-left py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                Budget Tracker
              </th>
              <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-32">
                Budget
              </th>
              <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-32">
                Actual
              </th>
              <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-36">
                Available
              </th>
            </tr>
            {/* ── Balance row (sticky with header) ── */}
            <tr className={cn(
              "border-b",
              readyToAssign > 0 && "bg-green-50/80 dark:bg-green-950/30",
              readyToAssign < 0 && "bg-red-50/80 dark:bg-red-950/30",
              readyToAssign === 0 && "bg-blue-50/80 dark:bg-blue-950/30"
            )}>
              <th className="text-left py-2 px-3 font-semibold text-xs uppercase tracking-wider">
                <span className="text-muted-foreground">Balance</span>
                {readyToAssign === 0 && incomeAssigned > 0 && (
                  <span className="ml-2 text-[10px] font-normal text-blue-600 dark:text-blue-400">
                    Every euro has a job!
                  </span>
                )}
                {readyToAssign > 0 && (
                  <span className="ml-2 text-[10px] font-normal text-green-600 dark:text-green-400">
                    You have money to assign
                  </span>
                )}
                {readyToAssign < 0 && (
                  <span className="ml-2 text-[10px] font-normal text-red-600 dark:text-red-400">
                    You assigned more than your income
                  </span>
                )}
              </th>
              <th className="text-right py-2 px-3">
                <MoneyDisplay
                  amount={readyToAssign}
                  colorize={false}
                  className={cn(
                    "text-sm font-bold",
                    readyToAssign > 0 && "text-green-600 dark:text-green-400",
                    readyToAssign < 0 && "text-red-600 dark:text-red-400",
                    readyToAssign === 0 && "text-blue-600 dark:text-blue-400"
                  )}
                />
              </th>
              <th className="text-right py-2 px-3">
                <MoneyDisplay
                  amount={actualBalance}
                  colorize={false}
                  className={cn(
                    "text-sm font-bold",
                    actualBalance > 0 && "text-green-600 dark:text-green-400",
                    actualBalance < 0 && "text-red-600 dark:text-red-400",
                    actualBalance === 0 && "text-muted-foreground"
                  )}
                />
              </th>
              <th />
            </tr>
          </thead>

          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <tbody>

            {groupsWithData.map((group) => {
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
                                });
                              }
                            }}
                          >
                            <input
                              value={editingIcon}
                              onChange={(e) => setEditingIcon(e.target.value)}
                              placeholder="🏷"
                              maxLength={2}
                              className="w-8 text-center bg-transparent border-0 border-b border-primary/50 outline-none text-sm py-0"
                            />
                            <input
                              autoFocus
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  setEditingCategoryId(null);
                                  setEditingName("");
                                }
                              }}
                              className="bg-transparent border-0 border-b border-primary/50 outline-none font-semibold text-sm py-0 px-1 w-full max-w-[200px]"
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
                            {isIncomeGroup && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400"
                              >
                                Income
                              </Badge>
                            )}
                            <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                              <button
                                onClick={() => setAddingCategoryToGroup(group.id)}
                                className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                                title="Add subcategory"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingCategoryId(group.id);
                                  setEditingName(group.name);
                                  setEditingIcon(group.icon ?? "");
                                }}
                                className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                                title="Rename group"
                              >
                                <Pencil className="h-3 w-3" />
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
                          <AvailableCell
                            amount={groupRemaining}
                            allocated={group.totalAllocated}
                            spent={group.totalSpent}
                          />
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

                  {/* Category rows */}
                  {!isCollapsed &&
                    group.children.map((cat) => {
                      const isEditingCat = editingCategoryId === cat.id;

                      return (
                        <SortableTr
                          key={cat.id}
                          id={`cat-${cat.id}`}
                          className={cn(
                            "border-b border-border/50 hover:bg-muted/20 group/catrow",
                            getRowBorder(cat.remaining, cat.allocated, cat.spent)
                          )}
                        >
                          {(catDragHandleProps) => (<>
                          <td className="py-1.5 px-3 pl-6">
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
                                  }
                                }}
                              >
                                <input
                                  value={editingIcon}
                                  onChange={(e) => setEditingIcon(e.target.value)}
                                  placeholder="🏷"
                                  maxLength={2}
                                  className="w-8 text-center bg-transparent border-0 border-b border-primary/50 outline-none text-sm py-0"
                                />
                                <input
                                  autoFocus
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") {
                                      setEditingCategoryId(null);
                                      setEditingName("");
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
                                  }}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </form>
                            ) : (
                              <div className="flex items-center gap-2">
                                <DragHandle
                                  listeners={catDragHandleProps}
                                  className="opacity-0 group-hover/catrow:opacity-100 transition-opacity"
                                />
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
                                <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/catrow:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      setEditingCategoryId(cat.id);
                                      setEditingName(cat.name);
                                      setEditingIcon(cat.icon ?? "");
                                    }}
                                    className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                                    title="Rename"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  {cat.transactionCount === 0 && (
                                    <button
                                      onClick={() =>
                                        deleteCategoryMutation.mutate({ id: cat.id })
                                      }
                                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-600"
                                      title="Delete category"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
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
                            <AvailableCell
                              amount={cat.remaining}
                              allocated={cat.allocated}
                              spent={cat.spent}
                            />
                          </td>
                        </>)}
                        </SortableTr>
                      );
                    })}

                  {/* Add category inline row */}
                  {!isCollapsed && addingCategoryToGroup === group.id && (
                    <tr className="border-b border-border/50 bg-muted/10">
                      <td className="py-1.5 px-3 pl-10" colSpan={4}>
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
                            }
                          }}
                        >
                          <input
                            value={newCategoryIcon}
                            onChange={(e) => setNewCategoryIcon(e.target.value)}
                            placeholder="🏷"
                            maxLength={2}
                            className="w-8 text-center bg-transparent border-0 border-b border-primary/50 outline-none text-sm py-0"
                          />
                          <input
                            autoFocus
                            placeholder="New category name..."
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setAddingCategoryToGroup(null);
                                setNewCategoryName("");
                                setNewCategoryIcon("");
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
                            }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                </GroupRows>
              );
            })}
          </tbody>
          </SortableContext>

          {/* Uncategorized spending */}
          {uncategorizedEntry && uncategorizedEntry.spent > 0 && (
            <tbody>
              <tr className="border-t-2 border-dashed border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                      Uncategorized
                    </span>
                  </div>
                </td>
                <td className="py-2 px-3 text-right">
                  <MoneyDisplay
                    amount={0}
                    colorize={false}
                    className="text-sm text-muted-foreground/50"
                  />
                </td>
                <td className="py-2 px-3 text-right">
                  <Link
                    href={(() => {
                      const mm = String(period.month).padStart(2, "0");
                      const lastDay = new Date(period.year, period.month, 0).getDate();
                      return `/transactions?accrualDateFrom=${period.year}-${mm}-01&accrualDateTo=${period.year}-${mm}-${String(lastDay).padStart(2, "0")}`;
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
                <td className="py-2 px-3 text-right">
                  <AvailableCell
                    amount={-uncategorizedEntry.spent}
                    allocated={0}
                    spent={uncategorizedEntry.spent}
                  />
                </td>
              </tr>
            </tbody>
          )}

          {/* Add Group row */}
          <tfoot>
            {showAddGroup ? (
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
                          type: "EXPENSE",
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
                          setShowAddGroup(false);
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
                        setShowAddGroup(false);
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
                    onClick={() => setShowAddGroup(true)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Add Category Group
                  </button>
                </td>
              </tr>
            )}
          </tfoot>
        </table>

        {/* Error display for category mutations */}
        {(createCategoryMutation.error ||
          updateCategoryMutation.error ||
          deleteCategoryMutation.error) && (
          <div className="px-3 py-2 text-sm text-red-600 border-t">
            {createCategoryMutation.error?.message ??
              updateCategoryMutation.error?.message ??
              deleteCategoryMutation.error?.message}
          </div>
        )}
      </div>

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
                  <td className="py-1.5 px-3 pl-10" colSpan={4}>
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

      {/* ── Recurring & Installments Tracker ──────────────────────── */}
      {tracker && (
        <div className="rounded-lg border bg-card overflow-x-clip">
          {/* Collapsible section header */}
          <div className="sticky top-16 z-10 bg-card flex items-center justify-between px-3 py-2.5 rounded-t-lg">
            <button
              onClick={() => setRecurringSectionCollapsed((v) => !v)}
              className="flex items-center gap-2 text-left hover:bg-muted/50 transition-colors rounded-md px-1 -mx-1"
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  !recurringSectionCollapsed && "rotate-90"
                )}
              />
              <Repeat className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Recurring & Installments</span>
              {recurringQuery.data && (recurringQuery.data.rules.length + (recurringQuery.data.inactiveRules?.length ?? 0)) > 0 && (
                <span className="text-xs text-muted-foreground ml-1">
                  ({recurringQuery.data.rules.length}{recurringQuery.data.inactiveRules && recurringQuery.data.inactiveRules.length > 0 ? ` + ${recurringQuery.data.inactiveRules.length} inactive` : ""})
                </span>
              )}
            </button>
            {!recurringSectionCollapsed && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-7 gap-1 text-xs font-medium transition-colors",
                    newPatterns.length > 0
                      ? "border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-500 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-950/60"
                      : "border-input text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => {
                    setSuggestionsExpanded((v) => {
                      if (!v) {
                        setTimeout(() => {
                          document
                            .getElementById("detected-patterns-panel")
                            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        }, 120);
                      }
                      return true;
                    });
                  }}
                >
                  <Sparkles className={cn("h-3 w-3", newPatterns.length > 0 ? "text-amber-500" : "text-muted-foreground")} />
                  Detected
                  {newPatterns.length > 0 && (
                    <Badge className="h-4 min-w-4 rounded-full px-1 text-[10px] font-semibold leading-none bg-amber-400 border-amber-400 text-white dark:bg-amber-500 dark:border-amber-500">
                      {newPatterns.length}
                    </Badge>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => {
                    resetRecurringForm();
                    setAddingRecurring(true);
                    setEditingRecurringId(null);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            )}
          </div>

          {!recurringSectionCollapsed && (
            <>
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-t border-b bg-muted/50">
                    <th className="text-center py-2.5 px-2 font-medium text-muted-foreground text-xs uppercase tracking-wider w-10">

                    </th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Name
                    </th>
                    <th className="text-center py-2.5 px-2 font-medium text-muted-foreground text-xs uppercase tracking-wider w-16">
                      Due
                    </th>
                    <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-28">
                      Expected
                    </th>
                    <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-28">
                      Actual
                    </th>
                    <th className="text-right py-2.5 px-2 font-medium text-muted-foreground text-xs uppercase tracking-wider w-16">

                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recurringGroups.map((group) => {
                    const groupKey = group.categoryId ?? "__uncategorized__";
                    const isCollapsed = collapsedRecurringGroups.has(groupKey);
                    const showGroupHeader = recurringGroups.length > 1;

                    return (
                      <React.Fragment key={groupKey}>
                        {/* Category group header */}
                        {showGroupHeader && (
                          <tr className="bg-muted/30 border-b border-border/50">
                            <td colSpan={6} className="py-1.5 px-3">
                              <button
                                onClick={() => toggleRecurringGroup(groupKey)}
                                className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-full"
                              >
                                <ChevronRight
                                  className={cn(
                                    "h-3 w-3 transition-transform",
                                    !isCollapsed && "rotate-90"
                                  )}
                                />
                                {group.categoryIcon && (
                                  <span>{group.categoryIcon}</span>
                                )}
                                <span>{group.categoryName}</span>
                                <span className="font-normal normal-case tracking-normal">
                                  ({group.activeRules.length} active
                                  {group.inactiveRules.length > 0 &&
                                    `, ${group.inactiveRules.length} inactive`}
                                  )
                                </span>
                              </button>
                            </td>
                          </tr>
                        )}

                        {/* Active rules */}
                        {!isCollapsed &&
                          group.activeRules.map((rule) => {
                            const isIncome = rule.type === "INCOME";
                            const statusIcon =
                              rule.status === "PAID" ? (
                                <CircleCheck className="h-4 w-4 text-green-500" />
                              ) : rule.status === "PENDING" ? (
                                <CircleDashed className="h-4 w-4 text-yellow-500" />
                              ) : (
                                <CircleAlert className="h-4 w-4 text-red-500" />
                              );

                            const borderClass =
                              rule.status === "PAID"
                                ? "border-l-2 border-l-green-500"
                                : rule.status === "PENDING"
                                  ? "border-l-2 border-l-yellow-500"
                                  : "border-l-2 border-l-red-500";

                            const dueDay = new Date(rule.expectedDueDate).getDate();
                            const dueSuffix =
                              dueDay === 1
                                ? "st"
                                : dueDay === 2
                                  ? "nd"
                                  : dueDay === 3
                                    ? "rd"
                                    : "th";

                            if (editingRecurringId === rule.id) {
                              return (
                                <tr
                                  key={rule.id}
                                  className="border-b border-border/50 bg-muted/10"
                                >
                                  <td colSpan={6} className="p-3">
                                    <RecurringForm
                                      form={recurringForm}
                                      setForm={setRecurringForm}
                                      accounts={accountsQuery.data ?? []}
                                      categories={treeQuery.data ?? []}
                                      isPending={updateRecurringMutation.isPending}
                                      onSubmit={() => {
                                        const amt = Math.round(
                                          parseFloat(recurringForm.amount) * 100
                                        );
                                        if (
                                          !recurringForm.name ||
                                          isNaN(amt) ||
                                          amt <= 0 ||
                                          !recurringForm.accountId
                                        )
                                          return;
                                        updateRecurringMutation.mutate({
                                          id: rule.id,
                                          name: recurringForm.name,
                                          description:
                                            recurringForm.description || undefined,
                                          amount: amt,
                                          type: recurringForm.type,
                                          frequency: recurringForm.frequency,
                                          startDate: new Date(
                                            recurringForm.startDate
                                          ),
                                          totalInstallments:
                                            recurringForm.totalInstallments
                                              ? parseInt(
                                                  recurringForm.totalInstallments
                                                )
                                              : null,
                                          categoryId:
                                            recurringForm.categoryId || null,
                                          accountId: recurringForm.accountId,
                                        });
                                      }}
                                      onCancel={() => {
                                        setEditingRecurringId(null);
                                        resetRecurringForm();
                                      }}
                                      submitLabel="Save"
                                    />
                                  </td>
                                </tr>
                              );
                            }

                            return (
                              <tr
                                key={rule.id}
                                className={cn(
                                  "border-b border-border/50 hover:bg-muted/20 group/row",
                                  borderClass,
                                  isIncome && "bg-blue-50/30 dark:bg-blue-950/10"
                                )}
                              >
                                <td className="text-center px-2 py-2">
                                  {statusIcon}
                                </td>
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-2">
                                    <Link
                                      href={`/transactions?search=${encodeURIComponent(
                                        rule.description
                                          ? extractDisplayName(rule.description)
                                          : rule.name
                                      )}&accountId=${rule.accountId}`}
                                      className="font-medium text-sm hover:underline hover:text-primary transition-colors"
                                      title="View all matching transactions"
                                    >
                                      {rule.name}
                                    </Link>
                                    {rule.installmentNumber !== null &&
                                      rule.totalInstallments !== null && (
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] px-1.5 py-0 font-mono"
                                        >
                                          {rule.installmentNumber}/
                                          {rule.totalInstallments}
                                        </Badge>
                                      )}
                                    {isIncome && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] px-1.5 py-0 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700"
                                      >
                                        Income
                                      </Badge>
                                    )}
                                    {/* Show category badge only when not grouped (single group) */}
                                    {!showGroupHeader && rule.category && (
                                      <span className="text-xs text-muted-foreground">
                                        {rule.category.icon} {rule.category.name}
                                      </span>
                                    )}
                                  </div>
                                  {rule.frequency !== "MONTHLY" && (
                                    <span className="text-[10px] text-muted-foreground mt-0.5 block">
                                      {rule.frequency.toLowerCase()}
                                    </span>
                                  )}
                                </td>
                                <td className="text-center px-2 py-2 text-xs text-muted-foreground">
                                  {dueDay}
                                  {dueSuffix}
                                </td>
                                <td className="text-right px-3 py-2">
                                  <MoneyDisplay
                                    amount={rule.amount}
                                    colorize={false}
                                    className="text-sm font-mono tabular-nums"
                                  />
                                </td>
                                <td className="text-right px-3 py-2">
                                  {rule.matchedTransaction ? (
                                    <MoneyDisplay
                                      amount={Math.abs(
                                        rule.matchedTransaction.amount
                                      )}
                                      colorize={false}
                                      className="text-sm font-mono tabular-nums text-green-600 dark:text-green-400"
                                    />
                                  ) : (
                                    <span className="text-sm text-muted-foreground/50">
                                      —
                                    </span>
                                  )}
                                </td>
                                <td className="text-right px-2 py-2">
                                  <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                    <button
                                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                      title="Edit"
                                      onClick={() => {
                                        setEditingRecurringId(rule.id);
                                        setAddingRecurring(false);
                                        setRecurringForm({
                                          name: rule.name,
                                          description: rule.description ?? "",
                                          amount: (rule.amount / 100).toFixed(2),
                                          type: rule.type as "INCOME" | "EXPENSE",
                                          frequency:
                                            rule.frequency as typeof recurringForm.frequency,
                                          startDate: new Date(rule.startDate)
                                            .toISOString()
                                            .slice(0, 10),
                                          totalInstallments:
                                            rule.totalInstallments?.toString() ??
                                            "",
                                          categoryId: rule.categoryId ?? "",
                                          accountId: rule.accountId,
                                        });
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    {rule.categoryId && (
                                      <button
                                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-blue-500"
                                        title="Re-apply category to matching transactions"
                                        onClick={() =>
                                          reapplyCategoryMutation.mutate({
                                            id: rule.id,
                                          })
                                        }
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    <button
                                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-orange-500"
                                      title="Mark as inactive"
                                      onClick={() =>
                                        updateRecurringMutation.mutate({
                                          id: rule.id,
                                          isActive: false,
                                        })
                                      }
                                    >
                                      <EyeOff className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-600"
                                      title="Delete"
                                      onClick={() =>
                                        deleteRecurringMutation.mutate({
                                          id: rule.id,
                                        })
                                      }
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}

                        {/* Inactive rules — collapsible sub-section */}
                        {!isCollapsed && group.inactiveRules.length > 0 && (
                          <>
                            <tr className="border-b border-border/30">
                              <td colSpan={6} className="py-1 px-3">
                                <button
                                  onClick={() => toggleInactiveGroup(groupKey)}
                                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                                >
                                  <ChevronRight
                                    className={cn(
                                      "h-2.5 w-2.5 transition-transform",
                                      expandedInactiveGroups.has(groupKey) && "rotate-90"
                                    )}
                                  />
                                  <EyeOff className="h-3 w-3" />
                                  <span>
                                    {group.inactiveRules.length} inactive
                                  </span>
                                </button>
                              </td>
                            </tr>
                            {expandedInactiveGroups.has(groupKey) &&
                              group.inactiveRules.map((rule) => (
                                <tr
                                  key={rule.id}
                                  className="border-b border-border/50 opacity-40 hover:opacity-70 group/row transition-opacity"
                                >
                                  <td className="text-center px-2 py-1.5">
                                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground/50" />
                                  </td>
                                  <td className="py-1.5 px-3">
                                    <div className="flex items-center gap-2">
                                      <Link
                                        href={`/transactions?search=${encodeURIComponent(
                                          rule.description
                                            ? extractDisplayName(rule.description)
                                            : rule.name
                                        )}&accountId=${rule.accountId}`}
                                        className="text-xs text-muted-foreground line-through hover:underline hover:text-primary transition-colors"
                                        title="View all matching transactions"
                                      >
                                        {rule.name}
                                      </Link>
                                      {rule.lastSeenDate && (
                                        <span className="text-[10px] text-muted-foreground/60">
                                          last: {formatShortDate(rule.lastSeenDate)}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="text-center px-2 py-1.5 text-xs text-muted-foreground/40">
                                    —
                                  </td>
                                  <td className="text-right px-3 py-1.5">
                                    <MoneyDisplay
                                      amount={rule.amount}
                                      colorize={false}
                                      className="text-xs font-mono tabular-nums text-muted-foreground/40 line-through"
                                    />
                                  </td>
                                  <td className="text-right px-3 py-1.5">
                                    <span className="text-xs text-muted-foreground/30">
                                      —
                                    </span>
                                  </td>
                                  <td className="text-right px-2 py-1.5">
                                    <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                      <button
                                        className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-950/30 text-muted-foreground hover:text-green-600"
                                        title="Reactivate"
                                        onClick={() =>
                                          updateRecurringMutation.mutate({
                                            id: rule.id,
                                            isActive: true,
                                          })
                                        }
                                      >
                                        <RotateCcw className="h-3 w-3" />
                                      </button>
                                      <button
                                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-600"
                                        title="Delete"
                                        onClick={() =>
                                          deleteRecurringMutation.mutate({
                                            id: rule.id,
                                          })
                                        }
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                          </>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Add form row */}
                  {addingRecurring && (
                    <tr className="border-b border-border/50 bg-muted/10">
                      <td colSpan={6} className="p-3">
                        <RecurringForm
                          form={recurringForm}
                          setForm={setRecurringForm}
                          accounts={accountsQuery.data ?? []}
                          categories={treeQuery.data ?? []}
                          isPending={createRecurringMutation.isPending}
                          onSubmit={() => {
                            const amt = Math.round(parseFloat(recurringForm.amount) * 100);
                            if (!recurringForm.name || isNaN(amt) || amt <= 0 || !recurringForm.accountId) return;
                            createRecurringMutation.mutate({
                              name: recurringForm.name,
                              description: recurringForm.description || undefined,
                              amount: amt,
                              type: recurringForm.type,
                              frequency: recurringForm.frequency,
                              startDate: new Date(recurringForm.startDate),
                              totalInstallments: recurringForm.totalInstallments ? parseInt(recurringForm.totalInstallments) : undefined,
                              categoryId: recurringForm.categoryId || undefined,
                              accountId: recurringForm.accountId,
                              visibility,
                            });
                          }}
                          onCancel={() => {
                            setAddingRecurring(false);
                            resetRecurringForm();
                          }}
                          submitLabel="Add"
                        />
                      </td>
                    </tr>
                  )}

                  {/* Loading state */}
                  {recurringQuery.isLoading && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                        Loading recurring rules...
                      </td>
                    </tr>
                  )}

                  {/* Error state */}
                  {recurringQuery.isError && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                        <p>Failed to load recurring rules.</p>
                        <button
                          className="text-primary hover:underline mt-1"
                          onClick={() => recurringQuery.refetch()}
                        >
                          Retry
                        </button>
                      </td>
                    </tr>
                  )}

                  {/* Empty state */}
                  {!recurringQuery.isLoading && !recurringQuery.isError && recurringQuery.data?.rules.length === 0 && !addingRecurring && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                        {detectQuery.isLoading ? (
                          <p>Analyzing transactions for recurring patterns...</p>
                        ) : newPatterns.length > 0 ? (
                          <p>
                            No rules yet — we detected{" "}
                            <button
                              className="text-primary hover:underline font-medium"
                              onClick={() => setSuggestionsExpanded(true)}
                            >
                              {newPatterns.length} recurring patterns
                            </button>{" "}
                            from your transactions. Review them below.
                          </p>
                        ) : (
                          <>
                            <p>No recurring payments tracked for this month.</p>
                            <button
                              className="text-primary hover:underline mt-1"
                              onClick={() => {
                                resetRecurringForm();
                                setAddingRecurring(true);
                              }}
                            >
                              Add manually
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Summary footer */}
                {recurringQuery.data && recurringQuery.data.rules.length > 0 && (
                  <tfoot>
                    <tr className="border-t bg-muted/30 font-medium text-xs">
                      <td colSpan={3} className="py-2 px-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground">
                            Expenses: {recurringQuery.data.rules.filter((r) => r.type === "EXPENSE" && r.status !== "PAID").length} pending
                          </span>
                          <span className="text-muted-foreground">
                            Income: {recurringQuery.data.rules.filter((r) => r.type === "INCOME" && r.status !== "PAID").length} pending
                          </span>
                        </div>
                      </td>
                      <td className="text-right py-2 px-3">
                        <div className="flex flex-col gap-0.5">
                          <MoneyDisplay
                            amount={recurringQuery.data.summary.totalExpected}
                            colorize={false}
                            className="text-xs font-mono tabular-nums"
                          />
                          <MoneyDisplay
                            amount={recurringQuery.data.summary.incomeExpected}
                            colorize={false}
                            className="text-xs font-mono tabular-nums text-blue-600 dark:text-blue-400"
                          />
                        </div>
                      </td>
                      <td className="text-right py-2 px-3">
                        <div className="flex flex-col gap-0.5">
                          <MoneyDisplay
                            amount={recurringQuery.data.summary.totalPaid}
                            colorize={false}
                            className="text-xs font-mono tabular-nums text-green-600 dark:text-green-400"
                          />
                          <MoneyDisplay
                            amount={recurringQuery.data.summary.incomePaid}
                            colorize={false}
                            className="text-xs font-mono tabular-nums text-blue-600 dark:text-blue-400"
                          />
                        </div>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>

              {/* ── Detected suggestions ── */}
              {detectQuery.data && (newPatterns.length > 0 || dismissedPatterns.length > 0) && (
                <div id="detected-patterns-panel" className="border-t">
                  {/* Collapsible header */}
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors text-left"
                    onClick={() => setSuggestionsExpanded((v) => !v)}
                  >
                    <div className="flex items-center gap-2">
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 text-muted-foreground transition-transform",
                          suggestionsExpanded && "rotate-90"
                        )}
                      />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Detected from transactions
                      </span>
                      {newPatterns.length > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-primary border-primary/30">
                          {newPatterns.length} new
                        </Badge>
                      )}
                      {dismissedPatterns.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          • {dismissedPatterns.length} dismissed
                        </span>
                      )}
                    </div>
                  </button>

                  {suggestionsExpanded && (
                    <div className="px-3 pb-3 space-y-1">
                      {/* New patterns */}
                      {newPatterns.map((pattern) => (
                        <div
                          key={pattern.key}
                          className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted/40"
                        >
                          <Repeat className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{pattern.name}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                                {pattern.frequency.toLowerCase()}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] px-1.5 py-0 flex-shrink-0",
                                  pattern.type === "INCOME"
                                    ? "text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700"
                                    : "text-muted-foreground"
                                )}
                              >
                                {pattern.type === "INCOME" ? "Income" : "Expense"}
                              </Badge>
                              <span className="text-xs text-muted-foreground flex-shrink-0">
                                {pattern.occurrences}× • {pattern.accountName}
                              </span>
                            </div>
                          </div>
                          <MoneyDisplay
                            amount={pattern.amount}
                            colorize={false}
                            className="text-sm font-mono tabular-nums flex-shrink-0"
                          />
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-950/30 text-muted-foreground hover:text-green-600"
                              title="Accept as recurring rule"
                              onClick={() =>
                                createRecurringMutation.mutate({
                                  name: pattern.name,
                                  description: pattern.description.slice(0, 200) || undefined,
                                  amount: pattern.amount,
                                  type: pattern.type,
                                  frequency: pattern.frequency,
                                  startDate: pattern.firstDate,
                                  categoryId: pattern.categoryId ?? undefined,
                                  accountId: pattern.accountId,
                                  visibility,
                                })
                              }
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              title="Dismiss"
                              onClick={() =>
                                dismissPatternMutation.mutate({
                                  patternKey: pattern.key,
                                  visibility,
                                })
                              }
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Dismissed sub-section */}
                      {dismissedPatterns.length > 0 && (
                        <div className="mt-2">
                          <button
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground py-1"
                            onClick={() => setDismissedSubExpanded((v) => !v)}
                          >
                            <ChevronRight
                              className={cn(
                                "h-3 w-3 transition-transform",
                                dismissedSubExpanded && "rotate-90"
                              )}
                            />
                            Dismissed ({dismissedPatterns.length})
                          </button>
                          {dismissedSubExpanded && (
                            <div className="space-y-1 mt-1">
                              {dismissedPatterns.map((pattern) => (
                                <div
                                  key={pattern.key}
                                  className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted/30 opacity-60"
                                >
                                  <Repeat className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm truncate line-through text-muted-foreground">{pattern.name}</span>
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                                        {pattern.frequency.toLowerCase()}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground flex-shrink-0">
                                        {pattern.occurrences}× • {pattern.accountName}
                                      </span>
                                    </div>
                                  </div>
                                  <MoneyDisplay
                                    amount={pattern.amount}
                                    colorize={false}
                                    className="text-sm font-mono tabular-nums flex-shrink-0 text-muted-foreground"
                                  />
                                  <button
                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex-shrink-0"
                                    title="Restore"
                                    onClick={() =>
                                      undismissPatternMutation.mutate({
                                        patternKey: pattern.key,
                                        visibility,
                                      })
                                    }
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

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

// ── Recurring form component ──────────────────────────────────────

interface RecurringFormData {
  name: string;
  description: string;
  amount: string;
  type: "INCOME" | "EXPENSE";
  frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  startDate: string;
  totalInstallments: string;
  categoryId: string;
  accountId: string;
}

function RecurringForm({
  form,
  setForm,
  accounts,
  categories,
  isPending,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  form: RecurringFormData;
  setForm: React.Dispatch<React.SetStateAction<RecurringFormData>>;
  accounts: { id: string; name: string; type: string }[];
  categories: { id: string; name: string; icon: string | null; type: string; children: { id: string; name: string; icon: string | null }[] }[];
  isPending: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const flatCategories = categories.flatMap((group) =>
    group.children.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      groupName: group.name,
    }))
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-3"
    >
      {/* Row 1: Name, Amount, Type */}
      <div className="flex gap-2 flex-wrap">
        <input
          autoFocus
          placeholder="Name (e.g. Netflix, Rent)"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="h-8 px-2 text-sm bg-background border rounded flex-1 min-w-[140px]"
        />
        <input
          placeholder="Amount"
          type="number"
          step="0.01"
          min="0.01"
          value={form.amount}
          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          className="h-8 px-2 text-sm bg-background border rounded w-24 font-mono"
        />
        <select
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as RecurringFormData["type"] }))}
          className="h-8 px-2 text-sm bg-background border rounded w-28"
        >
          <option value="EXPENSE">Expense</option>
          <option value="INCOME">Income</option>
        </select>
        <select
          value={form.frequency}
          onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as RecurringFormData["frequency"] }))}
          className="h-8 px-2 text-sm bg-background border rounded w-28"
        >
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="BIWEEKLY">Biweekly</option>
          <option value="MONTHLY">Monthly</option>
          <option value="QUARTERLY">Quarterly</option>
          <option value="YEARLY">Yearly</option>
        </select>
      </div>

      {/* Row 2: Start Date, Installments, Account, Category */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <label className="text-xs text-muted-foreground whitespace-nowrap">Start:</label>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            className="h-8 px-2 text-sm bg-background border rounded w-36"
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs text-muted-foreground whitespace-nowrap">Installments:</label>
          <input
            type="number"
            min="2"
            placeholder="∞"
            value={form.totalInstallments}
            onChange={(e) => setForm((f) => ({ ...f, totalInstallments: e.target.value }))}
            className="h-8 px-2 text-sm bg-background border rounded w-16 font-mono"
          />
        </div>
        <select
          value={form.accountId}
          onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
          className="h-8 px-2 text-sm bg-background border rounded flex-1 min-w-[120px]"
        >
          <option value="">Select account…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={form.categoryId}
          onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
          className="h-8 px-2 text-sm bg-background border rounded flex-1 min-w-[120px]"
        >
          <option value="">No category</option>
          {flatCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name} ({c.groupName})
            </option>
          ))}
        </select>
      </div>

      {/* Row 3: Description (optional) + Actions */}
      <div className="flex gap-2 items-center">
        <input
          placeholder="Description for matching (optional)"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="h-8 px-2 text-sm bg-background border rounded flex-1"
        />
        <button
          type="submit"
          disabled={isPending || !form.name || !form.amount || !form.accountId}
          className="h-8 px-3 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {isPending ? "…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-8 px-2 text-sm text-muted-foreground hover:text-foreground rounded hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
