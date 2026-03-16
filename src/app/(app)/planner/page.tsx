"use client";

import React, { Suspense, useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UpcomingTab } from "@/components/planner/upcoming-tab";
import { TagsTab } from "@/components/planner/tags-tab";
import { CostAnalysisTab } from "@/components/planner/cost-analysis-tab";
import { ReportsTab } from "@/components/planner/reports-tab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/money-display";
import { InlineMoneyEdit } from "@/components/shared/inline-money-edit";
import { getCurrentYearMonth, getPreviousMonth, getNextMonth } from "@/lib/date";
import { useOwnership } from "@/lib/ownership-context";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  GripVertical,
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

// ── Tab types ────────────────────────────────────────────────────
const TABS = ["upcoming", "tags", "cost-analysis", "reports"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  upcoming: "Upcoming",
  tags: "Tags",
  "cost-analysis": "Cost Analysis",
  reports: "Reports",
};

// ── Main Component ────────────────────────────────────────────────

export default function PlannerPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground p-8">Loading...</div>}>
      <PlannerContent />
    </Suspense>
  );
}

function PlannerContent() {
  const searchParams = useSearchParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { visibilityParam } = useOwnership();

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const param = searchParams.get("tab");
    return TABS.includes(param as Tab) ? (param as Tab) : "upcoming";
  });

  // Sync tab to URL
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    qs.set("tab", activeTab);
    window.history.replaceState(null, "", `?${qs.toString()}`);
  }, [activeTab]);

  const [period, setPeriod] = useState(getCurrentYearMonth());
  const [collapsedTagGroups, setCollapsedTagGroups] = useState<Set<string>>(new Set());

  // Tag management state
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const [addingTagToGroup, setAddingTagToGroup] = useState<string | null>(null);
  const [addingUngroupedTag, setAddingUngroupedTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [showAddTagGroup, setShowAddTagGroup] = useState(false);
  const [newTagGroupName, setNewTagGroupName] = useState("");

  // Month picker state
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

  // Visibility
  const visibility = visibilityParam ?? "SHARED";

  // Need tracker for allocation mutations (trackerId)
  const trackerQuery = useQuery(
    trpc.tracker.getOrCreate.queryOptions({
      month: period.month,
      year: period.year,
      visibility,
    })
  );

  // Tag queries
  const tagSummaryQuery = useQuery(
    trpc.tracker.getTagSummary.queryOptions({
      month: period.month,
      year: period.year,
      visibility,
    })
  );

  const tagGroupsQuery = useQuery(trpc.tag.listGroups.queryOptions({ visibility }));
  const tagsListQuery = useQuery(trpc.tag.list.queryOptions({ visibility }));

  // Tag allocation mutation
  const setTagAllocationMutation = useMutation(
    trpc.tracker.setTagAllocation.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    })
  );

  // Tag CRUD mutations
  const createTagMutation = useMutation(
    trpc.tag.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setAddingTagToGroup(null);
        setAddingUngroupedTag(false);
        setNewTagName("");
        setShowAddTagGroup(false);
        setNewTagGroupName("");
      },
    })
  );

  const updateTagMutation = useMutation(
    trpc.tag.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setEditingTagId(null);
        setEditingTagName("");
      },
    })
  );

  const deleteTagMutation = useMutation(
    trpc.tag.delete.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    })
  );

  const createTagGroupMutation = useMutation(
    trpc.tag.createGroup.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setShowAddTagGroup(false);
        setNewTagGroupName("");
      },
    })
  );

  const updateTagGroupMutation = useMutation(
    trpc.tag.updateGroup.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setEditingTagId(null);
        setEditingTagName("");
      },
    })
  );

  const deleteTagGroupMutation = useMutation(
    trpc.tag.deleteGroup.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    })
  );

  const reorderTagsMutation = useMutation(
    trpc.tag.reorderTags.mutationOptions({
      onError: (err) => toast.error(`Failed to reorder: ${err.message}`),
      onSettled: () => queryClient.invalidateQueries(),
    })
  );

  const reorderTagGroupsMutation = useMutation(
    trpc.tag.reorderGroups.mutationOptions({
      onError: (err) => toast.error(`Failed to reorder: ${err.message}`),
      onSettled: () => queryClient.invalidateQueries(),
    })
  );

  // ── DnD state & sensors ──
  const [activeTagDragId, setActiveTagDragId] = useState<string | null>(null);
  const isTagEditing = editingTagId !== null;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const tracker = trackerQuery.data;
  const monthName = new Date(period.year, period.month - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  // ── Tag data processing ──
  const tagSummaryTags = tagSummaryQuery.data?.tags ?? [];
  const allTags = tagsListQuery.data ?? [];
  const tagGroupsData = tagGroupsQuery.data ?? [];
  const tagSummaryMap = new Map(tagSummaryTags.map((t) => [t.tagId, t]));

  const tagGroupsWithData = tagGroupsData.map((group) => {
    const groupTags = allTags
      .filter((t) => t.groupId === group.id)
      .map((tag) => {
        const st = tagSummaryMap.get(tag.id);
        return {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          allocated: st?.allocated ?? 0,
          spent: st?.spent ?? 0,
          remaining: (st?.allocated ?? 0) - (st?.spent ?? 0),
          transactionCount: tag._count.transactions,
        };
      });
    return {
      id: group.id,
      name: group.name,
      color: group.color,
      tags: groupTags,
      tagCount: group._count.tags,
      totalAllocated: groupTags.reduce((s, t) => s + t.allocated, 0),
      totalSpent: groupTags.reduce((s, t) => s + t.spent, 0),
    };
  });

  const ungroupedTags = allTags
    .filter((t) => !t.groupId)
    .map((tag) => {
      const st = tagSummaryMap.get(tag.id);
      return {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        allocated: st?.allocated ?? 0,
        spent: st?.spent ?? 0,
        remaining: (st?.allocated ?? 0) - (st?.spent ?? 0),
        transactionCount: tag._count.transactions,
      };
    });

  // ── Tag DnD: build flat sortable ID list ──
  const tagSortableIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of tagGroupsWithData) {
      ids.push(`taggroup-${group.id}`);
      if (!collapsedTagGroups.has(group.id)) {
        for (const tag of group.tags) {
          ids.push(`tag-${tag.id}`);
        }
      }
    }
    for (const tag of ungroupedTags) {
      ids.push(`tag-${tag.id}`);
    }
    return ids;
  }, [tagGroupsWithData, ungroupedTags, collapsedTagGroups]);

  // Active tag drag item for overlay
  const activeTagDragItem = useMemo(() => {
    if (!activeTagDragId) return null;
    if (activeTagDragId.startsWith("taggroup-")) {
      const id = activeTagDragId.replace("taggroup-", "");
      const g = tagGroupsWithData.find((gr) => gr.id === id);
      return g ? { type: "taggroup" as const, data: g } : null;
    }
    if (activeTagDragId.startsWith("tag-")) {
      const id = activeTagDragId.replace("tag-", "");
      for (const g of tagGroupsWithData) {
        const t = g.tags.find((tg) => tg.id === id);
        if (t) return { type: "tag" as const, data: t, groupId: g.id };
      }
      const ut = ungroupedTags.find((t) => t.id === id);
      if (ut) return { type: "tag" as const, data: ut, groupId: null };
    }
    return null;
  }, [activeTagDragId, tagGroupsWithData, ungroupedTags]);

  // Loading state
  if (trackerQuery.isLoading || !tracker) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-[500px] w-full rounded-lg" />
      </div>
    );
  }

  // ── Tag DnD handlers ──
  const findTagGroup = (tagId: string) =>
    tagGroupsWithData.find((g) => g.tags.some((t) => t.id === tagId));

  function handleTagDragStart(event: DragStartEvent) {
    setActiveTagDragId(event.active.id as string);
  }

  function handleTagDragEnd(event: DragEndEvent) {
    setActiveTagDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeStr = active.id as string;
    const overStr = over.id as string;

    if (activeStr.startsWith("taggroup-") && overStr.startsWith("taggroup-")) {
      // ── Tag group reorder ──
      const activeId = activeStr.replace("taggroup-", "");
      const overId = overStr.replace("taggroup-", "");
      const oldIdx = tagGroupsWithData.findIndex((g) => g.id === activeId);
      const newIdx = tagGroupsWithData.findIndex((g) => g.id === overId);
      if (oldIdx === -1 || newIdx === -1) return;

      const reordered = arrayMove(tagGroupsWithData, oldIdx, newIdx);
      const items = reordered.map((g, i) => ({ id: g.id, sortOrder: i }));
      reorderTagGroupsMutation.mutate({ items });
    } else if (activeStr.startsWith("tag-")) {
      // ── Tag reorder / move ──
      const activeTagId = activeStr.replace("tag-", "");
      const sourceGroup = findTagGroup(activeTagId);
      const sourceGroupId = sourceGroup?.id ?? null;

      let targetGroupId: string | null;
      let insertIndex: number;

      if (overStr.startsWith("tag-")) {
        const overTagId = overStr.replace("tag-", "");
        const tg = findTagGroup(overTagId);
        targetGroupId = tg?.id ?? null;
        const targetList = tg ? tg.tags : ungroupedTags;
        insertIndex = targetList.findIndex((t) => t.id === overTagId);
      } else if (overStr.startsWith("taggroup-")) {
        targetGroupId = overStr.replace("taggroup-", "");
        insertIndex = 0;
      } else {
        return;
      }

      const sourceList = sourceGroup ? sourceGroup.tags : ungroupedTags;
      const targetGroup = targetGroupId
        ? tagGroupsWithData.find((g) => g.id === targetGroupId)
        : null;
      const targetList = targetGroup ? targetGroup.tags : ungroupedTags;

      if (sourceGroupId === targetGroupId) {
        // Same group/ungrouped — reorder
        const oldIdx = sourceList.findIndex((t) => t.id === activeTagId);
        if (oldIdx === -1) return;
        const reordered = arrayMove(sourceList, oldIdx, insertIndex);
        const items = reordered.map((t, i) => ({
          id: t.id,
          sortOrder: i,
          groupId: sourceGroupId,
        }));
        reorderTagsMutation.mutate({ items });
      } else {
        // Cross-group move
        const movedTag = sourceList.find((t) => t.id === activeTagId);
        if (!movedTag) return;
        const newTargetList = [...targetList];
        newTargetList.splice(insertIndex, 0, movedTag);

        const sourceItems = sourceList
          .filter((t) => t.id !== activeTagId)
          .map((t, i) => ({ id: t.id, sortOrder: i, groupId: sourceGroupId }));
        const targetItems = newTargetList.map((t, i) => ({
          id: t.id,
          sortOrder: i,
          groupId: targetGroupId,
        }));

        reorderTagsMutation.mutate({ items: [...sourceItems, ...targetItems] });
      }
    }
  }

  const toggleTagGroup = (groupId: string) => {
    setCollapsedTagGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // ── Render helpers for zero amounts ──
  function moneyOrDash(amount: number, className?: string) {
    if (amount === 0) {
      return <span className={cn("text-sm text-muted-foreground/40", className)}>—</span>;
    }
    return <MoneyDisplay amount={amount} colorize={false} className={cn("text-sm", className)} />;
  }

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
      </div>

      {/* ── Tab Bar ───────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* ── Upcoming Tab ───────────────────────────────────────────── */}
      {activeTab === "upcoming" && (
        <UpcomingTab month={period.month} year={period.year} visibility={visibility} />
      )}

      {/* ── Cost Analysis Tab ──────────────────────────────────────── */}
      {activeTab === "cost-analysis" && (
        <CostAnalysisTab month={period.month} year={period.year} visibility={visibility} />
      )}

      {/* ── Reports Tab ────────────────────────────────────────────── */}
      {activeTab === "reports" && (
        <ReportsTab month={period.month} year={period.year} visibility={visibility} />
      )}

      {/* ── Tags Explorer ─────────────────────────────────────────── */}
      {activeTab === "tags" && (
        <TagsTab month={period.month} year={period.year} visibility={visibility} />
      )}

      {/* ── Tag Budget Table (preserved but hidden — accessible via direct URL ?tab=tag-budget) */}
      {(activeTab as string) === "__tag-budget__" && <DndContext
        sensors={isTagEditing ? [] : sensors}
        collisionDetection={closestCenter}
        onDragStart={handleTagDragStart}
        onDragEnd={handleTagDragEnd}
      >
        <div className="rounded-lg border bg-card overflow-x-clip">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="sticky top-16 z-10">
              <tr className="border-b bg-muted/50">
                <th className="text-left py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Planner
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
            </thead>
            <SortableContext items={tagSortableIds} strategy={verticalListSortingStrategy}>
              <tbody>
                {/* Tag groups */}
                {tagGroupsWithData.map((group) => {
                  const groupRemaining = group.totalAllocated - group.totalSpent;
                  const isCollapsed = collapsedTagGroups.has(group.id);
                  const isEditingGroup = editingTagId === group.id;

                  return (
                    <GroupRows key={group.id}>
                      {/* Group header */}
                      <SortableTr
                        id={`taggroup-${group.id}`}
                        className="border-b bg-muted/30 hover:bg-muted/50 select-none group/row"
                      >
                        {(tagGroupDragProps) => (
                          <>
                            <td className="py-2 px-3">
                              {isEditingGroup ? (
                                <form
                                  className="flex items-center gap-1.5"
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    if (editingTagName.trim()) {
                                      updateTagGroupMutation.mutate({ id: group.id, name: editingTagName.trim() });
                                    }
                                  }}
                                >
                                  <input
                                    autoFocus
                                    value={editingTagName}
                                    onChange={(e) => setEditingTagName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Escape") { setEditingTagId(null); setEditingTagName(""); } }}
                                    className="h-6 px-1.5 text-sm font-semibold bg-background border rounded w-40"
                                  />
                                  <button type="submit" className="p-0.5 rounded hover:bg-muted text-green-600"><Check className="h-3.5 w-3.5" /></button>
                                  <button type="button" onClick={() => { setEditingTagId(null); setEditingTagName(""); }} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                                </form>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <DragHandle
                                    listeners={tagGroupDragProps}
                                    className="opacity-0 group-hover/row:opacity-100 transition-opacity"
                                  />
                                  <span className="cursor-pointer" onClick={() => toggleTagGroup(group.id)}>
                                    <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", !isCollapsed && "rotate-90")} />
                                  </span>
                                  {group.color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />}
                                  <span className="font-semibold cursor-pointer" onClick={() => toggleTagGroup(group.id)}>{group.name}</span>
                                  {/* Action buttons */}
                                  <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                    <button onClick={() => { setAddingTagToGroup(group.id); setNewTagName(""); }} className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground" title="Add tag">
                                      <Plus className="h-3 w-3" />
                                    </button>
                                    <button onClick={() => { setEditingTagId(group.id); setEditingTagName(group.name); }} className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground" title="Rename group">
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    {group.tagCount === 0 && (
                                      <button onClick={() => deleteTagGroupMutation.mutate({ id: group.id })} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-600" title="Delete group">
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {moneyOrDash(group.totalAllocated, "font-semibold")}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {group.totalSpent === 0
                                ? <span className="text-sm text-muted-foreground/40">—</span>
                                : <MoneyDisplay amount={-group.totalSpent} colorize={false} className={cn("text-sm font-semibold", "text-red-600 dark:text-red-400")} />
                              }
                            </td>
                            <td className="py-2 px-3 text-right">
                              {moneyOrDash(groupRemaining, cn("font-semibold", getAvailableColor(groupRemaining, group.totalAllocated, group.totalSpent)))}
                            </td>
                          </>
                        )}
                      </SortableTr>

                      {/* Individual tag rows */}
                      {!isCollapsed && group.tags.map((tag) => {
                        const isEditingThisTag = editingTagId === tag.id;
                        return (
                          <SortableTr
                            key={tag.id}
                            id={`tag-${tag.id}`}
                            className={cn("border-b border-border/50 hover:bg-muted/20 group/catrow", getRowBorder(tag.remaining, tag.allocated, tag.spent))}
                          >
                            {(tagDragProps) => (
                              <>
                                <td className="py-1.5 px-3 pl-6">
                                  {isEditingThisTag ? (
                                    <form
                                      className="flex items-center gap-1.5"
                                      onSubmit={(e) => {
                                        e.preventDefault();
                                        if (editingTagName.trim()) {
                                          updateTagMutation.mutate({ id: tag.id, name: editingTagName.trim() });
                                        }
                                      }}
                                    >
                                      <input
                                        autoFocus
                                        value={editingTagName}
                                        onChange={(e) => setEditingTagName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Escape") { setEditingTagId(null); setEditingTagName(""); } }}
                                        className="h-6 px-1.5 text-sm bg-background border rounded w-36"
                                      />
                                      <button type="submit" className="p-0.5 rounded hover:bg-muted text-green-600"><Check className="h-3.5 w-3.5" /></button>
                                      <button type="button" onClick={() => { setEditingTagId(null); setEditingTagName(""); }} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                                    </form>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <DragHandle
                                        listeners={tagDragProps}
                                        className="opacity-0 group-hover/catrow:opacity-100 transition-opacity"
                                      />
                                      {tag.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />}
                                      <span className="text-sm">{tag.name}</span>
                                      <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/catrow:opacity-100 transition-opacity">
                                        <button onClick={() => { setEditingTagId(tag.id); setEditingTagName(tag.name); }} className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground" title="Rename">
                                          <Pencil className="h-3 w-3" />
                                        </button>
                                        {tag.transactionCount === 0 && (
                                          <button onClick={() => deleteTagMutation.mutate({ id: tag.id })} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-600" title="Delete tag">
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 px-3 text-right">
                                  <InlineMoneyEdit key={`tag-alloc-${tracker.id}-${tag.id}`} value={tag.allocated} onSave={(cents) => setTagAllocationMutation.mutate({ trackerId: tracker.id, tagId: tag.id, amount: cents })} />
                                </td>
                                <td className="py-1.5 px-3 text-right">
                                  {tag.spent === 0
                                    ? <span className="text-sm text-muted-foreground/40">—</span>
                                    : <MoneyDisplay amount={-tag.spent} colorize={false} className={cn("text-sm", "text-red-600 dark:text-red-400")} />
                                  }
                                </td>
                                <td className={cn("py-1.5 px-3 text-right", getAvailableBg(tag.remaining, tag.allocated, tag.spent))}>
                                  {tag.allocated === 0 && tag.spent === 0
                                    ? <span className="text-sm text-muted-foreground/40">—</span>
                                    : <MoneyDisplay amount={tag.remaining} colorize={false} className={cn("text-sm font-medium", getAvailableColor(tag.remaining, tag.allocated, tag.spent))} />
                                  }
                                </td>
                              </>
                            )}
                          </SortableTr>
                        );
                      })}

                      {/* Add tag to group inline */}
                      {!isCollapsed && addingTagToGroup === group.id && (
                        <tr className="border-b border-border/50">
                          <td className="py-1.5 px-3 pl-10" colSpan={4}>
                            <form
                              className="flex items-center gap-1.5"
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (newTagName.trim()) {
                                  createTagMutation.mutate({ name: newTagName.trim(), groupId: group.id, visibility });
                                }
                              }}
                            >
                              <input
                                autoFocus
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Escape") { setAddingTagToGroup(null); setNewTagName(""); } }}
                                placeholder="New tag name..."
                                className="h-6 px-1.5 text-sm bg-background border rounded w-40"
                              />
                              <button type="submit" className="p-0.5 rounded hover:bg-muted text-green-600"><Check className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => { setAddingTagToGroup(null); setNewTagName(""); }} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                            </form>
                          </td>
                        </tr>
                      )}
                    </GroupRows>
                  );
                })}

                {/* Ungrouped tags */}
                {ungroupedTags.length > 0 && (
                  <GroupRows>
                    {tagGroupsWithData.length > 0 && (
                      <tr className="border-b bg-muted/30">
                        <td className="py-2 px-3" colSpan={4}>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-muted-foreground">Other Tags</span>
                            <div className="ml-auto">
                              <button onClick={() => { setAddingUngroupedTag(true); setNewTagName(""); }} className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground" title="Add tag">
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {ungroupedTags.map((tag) => {
                      const isEditingThisTag = editingTagId === tag.id;
                      return (
                        <SortableTr
                          key={tag.id}
                          id={`tag-${tag.id}`}
                          className={cn("border-b border-border/50 hover:bg-muted/20 group/catrow", getRowBorder(tag.remaining, tag.allocated, tag.spent))}
                        >
                          {(tagDragProps) => (
                            <>
                              <td className="py-1.5 px-3 pl-6">
                                {isEditingThisTag ? (
                                  <form
                                    className="flex items-center gap-1.5"
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      if (editingTagName.trim()) {
                                        updateTagMutation.mutate({ id: tag.id, name: editingTagName.trim() });
                                      }
                                    }}
                                  >
                                    <input
                                      autoFocus
                                      value={editingTagName}
                                      onChange={(e) => setEditingTagName(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === "Escape") { setEditingTagId(null); setEditingTagName(""); } }}
                                      className="h-6 px-1.5 text-sm bg-background border rounded w-36"
                                    />
                                    <button type="submit" className="p-0.5 rounded hover:bg-muted text-green-600"><Check className="h-3.5 w-3.5" /></button>
                                    <button type="button" onClick={() => { setEditingTagId(null); setEditingTagName(""); }} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                                  </form>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <DragHandle
                                      listeners={tagDragProps}
                                      className="opacity-0 group-hover/catrow:opacity-100 transition-opacity"
                                    />
                                    {tag.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />}
                                    <span className="text-sm">{tag.name}</span>
                                    <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/catrow:opacity-100 transition-opacity">
                                      <button onClick={() => { setEditingTagId(tag.id); setEditingTagName(tag.name); }} className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground" title="Rename">
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                      {tag.transactionCount === 0 && (
                                        <button onClick={() => deleteTagMutation.mutate({ id: tag.id })} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-600" title="Delete tag">
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td className="py-1.5 px-3 text-right">
                                <InlineMoneyEdit key={`tag-alloc-${tracker.id}-${tag.id}`} value={tag.allocated} onSave={(cents) => setTagAllocationMutation.mutate({ trackerId: tracker.id, tagId: tag.id, amount: cents })} />
                              </td>
                              <td className="py-1.5 px-3 text-right">
                                {tag.spent === 0
                                  ? <span className="text-sm text-muted-foreground/40">—</span>
                                  : <MoneyDisplay amount={-tag.spent} colorize={false} className={cn("text-sm", "text-red-600 dark:text-red-400")} />
                                }
                              </td>
                              <td className={cn("py-1.5 px-3 text-right", getAvailableBg(tag.remaining, tag.allocated, tag.spent))}>
                                {tag.allocated === 0 && tag.spent === 0
                                  ? <span className="text-sm text-muted-foreground/40">—</span>
                                  : <MoneyDisplay amount={tag.remaining} colorize={false} className={cn("text-sm font-medium", getAvailableColor(tag.remaining, tag.allocated, tag.spent))} />
                                }
                              </td>
                            </>
                          )}
                        </SortableTr>
                      );
                    })}
                    {/* Add ungrouped tag inline */}
                    {addingUngroupedTag && (
                      <tr className="border-b border-border/50">
                        <td className="py-1.5 px-3 pl-10" colSpan={4}>
                          <form
                            className="flex items-center gap-1.5"
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (newTagName.trim()) {
                                createTagMutation.mutate({ name: newTagName.trim(), visibility });
                              }
                            }}
                          >
                            <input
                              autoFocus
                              value={newTagName}
                              onChange={(e) => setNewTagName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Escape") { setAddingUngroupedTag(false); setNewTagName(""); } }}
                              placeholder="New tag name..."
                              className="h-6 px-1.5 text-sm bg-background border rounded w-40"
                            />
                            <button type="submit" className="p-0.5 rounded hover:bg-muted text-green-600"><Check className="h-3.5 w-3.5" /></button>
                            <button type="button" onClick={() => { setAddingUngroupedTag(false); setNewTagName(""); }} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                          </form>
                        </td>
                      </tr>
                    )}
                  </GroupRows>
                )}
              </tbody>
            </SortableContext>

            {/* Add tag group / add tag footer */}
            <tfoot>
              {showAddTagGroup ? (
                <tr className="border-t">
                  <td className="py-2 px-3" colSpan={4}>
                    <form
                      className="flex items-center gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (newTagGroupName.trim()) {
                          createTagGroupMutation.mutate({ name: newTagGroupName.trim(), visibility });
                        }
                      }}
                    >
                      <input
                        autoFocus
                        value={newTagGroupName}
                        onChange={(e) => setNewTagGroupName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Escape") { setShowAddTagGroup(false); setNewTagGroupName(""); } }}
                        placeholder="New group name..."
                        className="h-6 px-1.5 text-sm bg-background border rounded w-40"
                      />
                      <button type="submit" className="p-0.5 rounded hover:bg-muted text-green-600"><Check className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => { setShowAddTagGroup(false); setNewTagGroupName(""); }} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr className="border-t">
                  <td className="py-2 px-3" colSpan={4}>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setShowAddTagGroup(true)}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                        Add Tag Group
                      </button>
                      {tagGroupsWithData.length === 0 && (
                        <button
                          onClick={() => { setAddingUngroupedTag(true); setNewTagName(""); }}
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Plus className="h-4 w-4" />
                          Add Tag
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        {/* Tag DnD Overlay */}
        <DragOverlay dropAnimation={null}>
          {activeTagDragItem && (
            <table className="w-full text-sm border-collapse">
              <tbody>
                {activeTagDragItem.type === "taggroup" ? (
                  <tr className="bg-card shadow-lg ring-2 ring-primary/30 rounded">
                    <td className="py-2 px-3" colSpan={4}>
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        {activeTagDragItem.data.color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: activeTagDragItem.data.color }} />}
                        <span className="font-semibold">{activeTagDragItem.data.name}</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr className="bg-card shadow-lg ring-2 ring-primary/30 rounded">
                    <td className="py-1.5 px-3 pl-6" colSpan={4}>
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        {activeTagDragItem.data.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: activeTagDragItem.data.color }} />}
                        <span className="text-sm">{activeTagDragItem.data.name}</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </DragOverlay>
      </DndContext>}
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
