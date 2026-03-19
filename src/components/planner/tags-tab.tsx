"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MoneyDisplay } from "@/components/shared/money-display";
import { InlineMoneyEdit } from "@/components/shared/inline-money-edit";
import { TagAnalysisPanel } from "./tag-analysis-panel";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Tag, ChevronDown, Plus, Trash2, GripVertical } from "lucide-react";
import { getMonthRange } from "@/lib/date";
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

interface TagsTabProps {
  month: number;
  year: number;
  visibility: "SHARED" | "PERSONAL";
}

export function TagsTab({ month, year, visibility }: TagsTabProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Date ranges
  const { start: monthFrom, end: monthTo } = useMemo(() => getMonthRange(year, month), [year, month]);
  const yearFrom = useMemo(() => new Date(year, 0, 1), [year]);

  const tagsQuery = useQuery(trpc.tag.list.queryOptions({ visibility }));
  const tagGroupsQuery = useQuery(trpc.tag.listGroups.queryOptions({ visibility }));
  const monthTotalsQuery = useQuery(trpc.tag.getTagTotals.queryOptions({ visibility, dateFrom: monthFrom, dateTo: monthTo }));
  const yearTotalsQuery = useQuery(trpc.tag.getTagTotals.queryOptions({ visibility, dateFrom: yearFrom }));
  const trackerQuery = useQuery(trpc.tracker.getOrCreate.queryOptions({ month, year, visibility }));
  const tagSummaryQuery = useQuery(trpc.tracker.getTagSummary.queryOptions({ month, year, visibility }));
  const yearlyBudgetsQuery = useQuery(trpc.tag.getYearlyBudgets.queryOptions({ year, visibility }));

  const allTags = tagsQuery.data ?? [];
  const tagGroups = tagGroupsQuery.data ?? [];
  const tracker = trackerQuery.data;

  // Build lookup maps
  const monthTotalsMap = useMemo(() => {
    const m = new Map<string, { totalAmount: number; count: number }>();
    for (const t of monthTotalsQuery.data?.totals ?? []) m.set(t.tagId, t);
    return m;
  }, [monthTotalsQuery.data]);

  const yearTotalsMap = useMemo(() => {
    const m = new Map<string, { totalAmount: number; count: number }>();
    for (const t of yearTotalsQuery.data?.totals ?? []) m.set(t.tagId, t);
    return m;
  }, [yearTotalsQuery.data]);

  const monthBudgetMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tagSummaryQuery.data?.tags ?? []) m.set(t.tagId, t.allocated);
    return m;
  }, [tagSummaryQuery.data]);

  const yearBudgetMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of yearlyBudgetsQuery.data?.budgets ?? []) m.set(b.tagId, b.amount);
    return m;
  }, [yearlyBudgetsQuery.data]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [analysisTarget, setAnalysisTarget] = useState<{ type: "group" | "tag"; id: string; name: string } | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const analysisPanelRef = useRef<HTMLDivElement>(null);

  // CRUD state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingType, setEditingType] = useState<"tag" | "group">("tag");
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string; txnCount: number } | null>(null);

  // Mutations
  const invalidateAll = () => queryClient.invalidateQueries();

  const createTagMutation = useMutation(
    trpc.tag.create.mutationOptions({
      onSuccess: () => { invalidateAll(); setAddingToGroup(null); setNewTagName(""); },
    })
  );
  const updateTagMutation = useMutation(
    trpc.tag.update.mutationOptions({
      onSuccess: () => { invalidateAll(); setEditingId(null); },
    })
  );
  const deleteTagMutation = useMutation(
    trpc.tag.delete.mutationOptions({ onSuccess: () => { invalidateAll(); setDeleteConfirm(null); } })
  );
  const createGroupMutation = useMutation(
    trpc.tag.createGroup.mutationOptions({
      onSuccess: () => { invalidateAll(); setAddingGroup(false); setNewGroupName(""); },
    })
  );
  const updateGroupMutation = useMutation(
    trpc.tag.updateGroup.mutationOptions({
      onSuccess: () => { invalidateAll(); setEditingId(null); },
    })
  );
  const deleteGroupMutation = useMutation(
    trpc.tag.deleteGroup.mutationOptions({ onSuccess: invalidateAll })
  );
  const setTagAllocationMutation = useMutation(
    trpc.tracker.setTagAllocation.mutationOptions({ onSuccess: invalidateAll })
  );
  const reorderTagsMutation = useMutation(
    trpc.tag.reorderTags.mutationOptions({ onSettled: invalidateAll })
  );
  const reorderGroupsMutation = useMutation(
    trpc.tag.reorderGroups.mutationOptions({ onSettled: invalidateAll })
  );

  // Group tags by their group
  const groupedData = useMemo(() => {
    const groups = tagGroups.map((g) => ({
      ...g,
      tags: allTags.filter((t) => t.groupId === g.id),
    }));
    const ungrouped = allTags.filter((t) => !t.groupId);
    return { groups, ungrouped };
  }, [allTags, tagGroups]);

  // DnD: build flat sortable ID list
  const sortableIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groupedData.groups) {
      ids.push(`taggroup-${group.id}`);
      if (!collapsedGroups.has(group.id)) {
        for (const tag of group.tags) ids.push(`tag-${tag.id}`);
      }
    }
    for (const tag of groupedData.ungrouped) ids.push(`tag-${tag.id}`);
    return ids;
  }, [groupedData, collapsedGroups]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Active drag item for overlay
  const activeDragItem = useMemo(() => {
    if (!activeDragId) return null;
    if (activeDragId.startsWith("taggroup-")) {
      const id = activeDragId.replace("taggroup-", "");
      const g = groupedData.groups.find((gr) => gr.id === id);
      return g ? { type: "group" as const, name: g.name } : null;
    }
    if (activeDragId.startsWith("tag-")) {
      const id = activeDragId.replace("tag-", "");
      for (const g of groupedData.groups) {
        const t = g.tags.find((tg) => tg.id === id);
        if (t) return { type: "tag" as const, name: t.name };
      }
      const ut = groupedData.ungrouped.find((t) => t.id === id);
      if (ut) return { type: "tag" as const, name: ut.name };
    }
    return null;
  }, [activeDragId, groupedData]);

  const findTagGroup = (tagId: string) =>
    groupedData.groups.find((g) => g.tags.some((t) => t.id === tagId));

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeStr = active.id as string;
    const overStr = over.id as string;

    if (activeStr.startsWith("taggroup-") && overStr.startsWith("taggroup-")) {
      // Group reorder
      const activeId = activeStr.replace("taggroup-", "");
      const overId = overStr.replace("taggroup-", "");
      const oldIdx = groupedData.groups.findIndex((g) => g.id === activeId);
      const newIdx = groupedData.groups.findIndex((g) => g.id === overId);
      if (oldIdx === -1 || newIdx === -1) return;
      const reordered = arrayMove(groupedData.groups, oldIdx, newIdx);
      reorderGroupsMutation.mutate({ items: reordered.map((g, i) => ({ id: g.id, sortOrder: i })) });
    } else if (activeStr.startsWith("tag-")) {
      // Tag reorder / cross-group move
      const activeTagId = activeStr.replace("tag-", "");
      const sourceGroup = findTagGroup(activeTagId);
      const sourceGroupId = sourceGroup?.id ?? null;

      let targetGroupId: string | null;
      let insertIndex: number;

      if (overStr.startsWith("tag-")) {
        const overTagId = overStr.replace("tag-", "");
        const tg = findTagGroup(overTagId);
        targetGroupId = tg?.id ?? null;
        const targetList = tg ? tg.tags : groupedData.ungrouped;
        insertIndex = targetList.findIndex((t) => t.id === overTagId);
      } else if (overStr.startsWith("taggroup-")) {
        targetGroupId = overStr.replace("taggroup-", "");
        insertIndex = 0;
      } else {
        return;
      }

      const sourceList = sourceGroup ? sourceGroup.tags : groupedData.ungrouped;
      const targetGroup = targetGroupId ? groupedData.groups.find((g) => g.id === targetGroupId) : null;
      const targetList = targetGroup ? targetGroup.tags : groupedData.ungrouped;

      if (sourceGroupId === targetGroupId) {
        // Same group — reorder
        const oldIdx = sourceList.findIndex((t) => t.id === activeTagId);
        if (oldIdx === -1) return;
        const reordered = arrayMove(sourceList, oldIdx, insertIndex);
        reorderTagsMutation.mutate({
          items: reordered.map((t, i) => ({ id: t.id, sortOrder: i, groupId: sourceGroupId })),
        });
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

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getGroupTotals = (tags: typeof allTags) => {
    let monthSpent = 0, monthBudget = 0, yearSpent = 0, yearBudget = 0, count = 0;
    let hasMonth = false, hasYear = false;
    for (const tag of tags) {
      const mt = monthTotalsMap.get(tag.id);
      if (mt) { monthSpent += mt.totalAmount; count += mt.count; hasMonth = true; }
      const yt = yearTotalsMap.get(tag.id);
      if (yt) { yearSpent += yt.totalAmount; hasYear = true; }
      monthBudget += monthBudgetMap.get(tag.id) ?? 0;
      yearBudget += yearBudgetMap.get(tag.id) ?? 0;
    }
    const monthBalance = monthBudget - Math.abs(monthSpent);
    const yearBalance = yearBudget - Math.abs(yearSpent);
    return { monthSpent, monthBudget, monthBalance, yearSpent, yearBudget, yearBalance, count, hasMonth, hasYear };
  };

  const startEditing = (id: string, name: string, type: "tag" | "group") => {
    setEditingId(id); setEditingName(name); setEditingType(type);
  };

  const submitEdit = () => {
    if (!editingId || !editingName.trim()) { setEditingId(null); return; }
    if (editingType === "tag") updateTagMutation.mutate({ id: editingId, name: editingName.trim() });
    else updateGroupMutation.mutate({ id: editingId, name: editingName.trim() });
  };

  const handleCreateTag = (groupId?: string) => {
    if (!newTagName.trim()) return;
    createTagMutation.mutate({ name: newTagName.trim(), visibility, ...(groupId && { groupId }) });
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    createGroupMutation.mutate({ name: newGroupName.trim(), visibility });
  };

  const handleDeleteTag = (tagId: string, tagName: string, txnCount: number) => {
    if (txnCount > 0) setDeleteConfirm({ id: tagId, name: tagName, txnCount });
    else deleteTagMutation.mutate({ id: tagId });
  };

  const handleSetBudget = (tagId: string, cents: number) => {
    if (!tracker) return;
    setTagAllocationMutation.mutate({ trackerId: tracker.id, tagId, amount: cents });
  };

  const toggleAnalysis = (type: "group" | "tag", id: string, name: string) => {
    setAnalysisTarget((prev) => {
      const closing = prev?.type === type && prev.id === id;
      if (!closing) {
        // Scroll to analysis panel after React renders it
        setTimeout(() => analysisPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      }
      return closing ? null : { type, id, name };
    });
  };

  if (allTags.length === 0 && tagGroups.length === 0 && !tagsQuery.isLoading) {
    return (
      <div className="text-center py-12 space-y-3">
        <Tag className="h-10 w-10 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground">
          No tags yet. Tags let you track spending across categories — trips, subscriptions, projects, and more.
        </p>
        <button onClick={() => setAddingGroup(true)} className="text-sm text-primary hover:underline">
          + Create your first tag group
        </button>
        {addingGroup && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <InlineInput value={newGroupName} onChange={setNewGroupName} onSubmit={handleCreateGroup}
              onCancel={() => { setAddingGroup(false); setNewGroupName(""); }} placeholder="Group name" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card overflow-x-clip">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <table className="w-full text-sm">
              <thead className="sticky top-16 z-10">
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    <div className="flex items-center justify-between">
                      <span>Tag</span>
                      <button onClick={() => setAddingGroup(true)}
                        className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors normal-case tracking-normal">
                        + New Group
                      </button>
                    </div>
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24">Spent</th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24">Budget</th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24">Balance</th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24">Year spent</th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24">Year budget</th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24">Year bal.</th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-14">Count</th>
                </tr>
              </thead>
              <tbody>
                {groupedData.groups.map((group) => {
                  const isCollapsed = collapsedGroups.has(group.id);
                  const groupTotals = getGroupTotals(group.tags);
                  const isAnalysisActive = analysisTarget?.type === "group" && analysisTarget.id === group.id;
                  return (
                    <GroupRows key={group.id}>
                      {/* Group header */}
                      <SortableTr
                        id={`taggroup-${group.id}`}
                        className={cn("border-b border-border/50 hover:bg-muted/20 group/row cursor-pointer", isAnalysisActive && "bg-primary/5")}
                        onClick={() => toggleAnalysis("group", group.id, group.name)}
                      >
                        {(dragListeners) => (
                          <>
                            <td className="py-2 px-4">
                              <div className="flex items-center gap-2">
                                <DragHandle listeners={dragListeners} />
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleGroup(group.id); }}
                                  className="flex items-center gap-2 text-left flex-1 min-w-0"
                                >
                                  <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", isCollapsed && "-rotate-90")} />
                                  {group.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />}
                                  {editingId === group.id ? (
                                    <InlineInput value={editingName} onChange={setEditingName} onSubmit={submitEdit}
                                      onCancel={() => setEditingId(null)} placeholder="Group name" className="font-semibold" />
                                  ) : (
                                    <span className="font-semibold text-sm truncate cursor-text hover:underline decoration-muted-foreground/30 underline-offset-2"
                                      onClick={(e) => { e.stopPropagation(); startEditing(group.id, group.name, "group"); }}>
                                      {group.name}
                                    </span>
                                  )}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); if (group.tags.length > 0) return; deleteGroupMutation.mutate({ id: group.id }); }}
                                  title={group.tags.length > 0 ? "Remove all tags first" : "Delete group"}
                                  className={cn("p-1 rounded opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0", group.tags.length > 0 ? "text-muted-foreground/20 cursor-not-allowed" : "text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10")}>
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <GroupDataCells totals={groupTotals} />
                          </>
                        )}
                      </SortableTr>
                      {/* Tags in group */}
                      {!isCollapsed && group.tags.map((tag) => {
                        const isTagActive = analysisTarget?.type === "tag" && analysisTarget.id === tag.id;
                        const mt = monthTotalsMap.get(tag.id);
                        const yt = yearTotalsMap.get(tag.id);
                        const mBudget = monthBudgetMap.get(tag.id) ?? 0;
                        const yBudget = yearBudgetMap.get(tag.id) ?? 0;
                        return (
                          <SortableTr key={tag.id} id={`tag-${tag.id}`}
                            className={cn("border-b border-border/30 hover:bg-muted/20 group/row cursor-pointer", isTagActive && "bg-primary/5")}
                            onClick={() => toggleAnalysis("tag", tag.id, tag.name)}>
                            {(dragListeners) => (
                              <>
                                <td className="py-1.5 px-4 pl-7">
                                  <div className="flex items-center gap-2">
                                    <DragHandle listeners={dragListeners} className="opacity-0 group-hover/row:opacity-100" />
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag.id, tag.name, tag._count?.transactions ?? 0); }}
                                      title="Delete tag" className="p-1 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                    {editingId === tag.id ? (
                                      <InlineInput value={editingName} onChange={setEditingName} onSubmit={submitEdit}
                                        onCancel={() => setEditingId(null)} placeholder="Tag name" />
                                    ) : (
                                      <span className="text-sm truncate cursor-text hover:underline decoration-muted-foreground/30 underline-offset-2"
                                        onClick={(e) => { e.stopPropagation(); startEditing(tag.id, tag.name, "tag"); }}>
                                        {tag.name}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <TagDataCells mt={mt} yt={yt} mBudget={mBudget} yBudget={yBudget} tagId={tag.id} onSetBudget={handleSetBudget} />
                              </>
                            )}
                          </SortableTr>
                        );
                      })}
                      {/* Add tag row */}
                      {!isCollapsed && (
                        <tr className="border-b border-border/30">
                          <td colSpan={8} className="py-1 px-4 pl-10">
                            {addingToGroup === group.id ? (
                              <InlineInput value={newTagName} onChange={setNewTagName} onSubmit={() => handleCreateTag(group.id)}
                                onCancel={() => { setAddingToGroup(null); setNewTagName(""); }} placeholder="Tag name" />
                            ) : (
                              <button onClick={() => setAddingToGroup(group.id)}
                                className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors flex items-center gap-1">
                                <Plus className="h-3 w-3" /> Add tag
                              </button>
                            )}
                          </td>
                        </tr>
                      )}
                    </GroupRows>
                  );
                })}

                {/* Ungrouped tags */}
                {groupedData.ungrouped.map((tag) => {
                  const isTagActive = analysisTarget?.type === "tag" && analysisTarget.id === tag.id;
                  const mt = monthTotalsMap.get(tag.id);
                  const yt = yearTotalsMap.get(tag.id);
                  const mBudget = monthBudgetMap.get(tag.id) ?? 0;
                  const yBudget = yearBudgetMap.get(tag.id) ?? 0;
                  return (
                    <SortableTr key={tag.id} id={`tag-${tag.id}`}
                      className={cn("border-b border-border/30 hover:bg-muted/20 group/row cursor-pointer", isTagActive && "bg-primary/5")}
                      onClick={() => toggleAnalysis("tag", tag.id, tag.name)}>
                      {(dragListeners) => (
                        <>
                          <td className="py-1.5 px-4">
                            <div className="flex items-center gap-2">
                              <DragHandle listeners={dragListeners} className="opacity-0 group-hover/row:opacity-100" />
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag.id, tag.name, tag._count?.transactions ?? 0); }}
                                title="Delete tag" className="p-1 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
                                <Trash2 className="h-3 w-3" />
                              </button>
                              {editingId === tag.id ? (
                                <InlineInput value={editingName} onChange={setEditingName} onSubmit={submitEdit}
                                  onCancel={() => setEditingId(null)} placeholder="Tag name" />
                              ) : (
                                <span className="text-sm truncate cursor-text hover:underline decoration-muted-foreground/30 underline-offset-2"
                                  onClick={(e) => { e.stopPropagation(); startEditing(tag.id, tag.name, "tag"); }}>
                                  {tag.name}
                                </span>
                              )}
                            </div>
                          </td>
                          <TagDataCells mt={mt} yt={yt} mBudget={mBudget} yBudget={yBudget} tagId={tag.id} onSetBudget={handleSetBudget} />
                        </>
                      )}
                    </SortableTr>
                  );
                })}

                {/* Add new group row */}
                {addingGroup && (
                  <tr className="border-b border-border/30">
                    <td colSpan={8} className="py-1.5 px-4">
                      <div className="flex items-center gap-2">
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <InlineInput value={newGroupName} onChange={setNewGroupName} onSubmit={handleCreateGroup}
                          onCancel={() => { setAddingGroup(false); setNewGroupName(""); }} placeholder="Group name" className="font-semibold" />
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </SortableContext>

          <DragOverlay>
            {activeDragItem && (
              <div className="bg-card border rounded-md shadow-lg px-4 py-2 text-sm">
                <span className={cn(activeDragItem.type === "group" && "font-semibold")}>
                  {activeDragItem.name}
                </span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Analysis panel */}
      {analysisTarget && (
        <div ref={analysisPanelRef}>
          <TagAnalysisPanel target={analysisTarget} visibility={visibility}
            onClose={() => setAnalysisTarget(null)}
            onSelectTag={(id, name) => setAnalysisTarget({ type: "tag", id, name })} />
        </div>
      )}

      {/* Delete tag confirmation dialog */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogHeader onClose={() => setDeleteConfirm(null)}>
          <DialogTitle>Delete tag &ldquo;{deleteConfirm?.name}&rdquo;?</DialogTitle>
          <DialogDescription>
            This tag is used in {deleteConfirm?.txnCount} transaction{deleteConfirm?.txnCount !== 1 ? "s" : ""}.
            The tag will be removed from all transactions, but the transactions themselves will not be deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="rounded-md bg-destructive/5 border border-destructive/20 px-3 py-2 text-sm text-muted-foreground">
            {deleteConfirm?.txnCount} transaction{deleteConfirm?.txnCount !== 1 ? "s" : ""} will be untagged from &ldquo;{deleteConfirm?.name}&rdquo;.
          </div>
        </DialogBody>
        <DialogFooter>
          <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1.5 text-sm rounded-md border hover:bg-muted transition-colors">Cancel</button>
          <button onClick={() => { if (deleteConfirm) deleteTagMutation.mutate({ id: deleteConfirm.id }); }}
            disabled={deleteTagMutation.isPending}
            className="px-3 py-1.5 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50">
            {deleteTagMutation.isPending ? "Deleting..." : "Delete tag"}
          </button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

const DASH = <span className="text-xs text-muted-foreground/40">—</span>;
const P = "py-1.5 px-3 text-right tabular-nums";

// Data cells for a tag row
function TagDataCells({ mt, yt, mBudget, yBudget, tagId, onSetBudget }: {
  mt: { totalAmount: number; count: number } | undefined;
  yt: { totalAmount: number; count: number } | undefined;
  mBudget: number;
  yBudget: number;
  tagId: string;
  onSetBudget: (tagId: string, cents: number) => void;
}) {
  const monthSpent = mt?.totalAmount ?? 0;
  const yearSpent = yt?.totalAmount ?? 0;
  const monthBalance = mBudget - Math.abs(monthSpent);
  const yearBalance = yBudget - Math.abs(yearSpent);
  return (
    <>
      <td className={P}>{monthSpent !== 0 ? <MoneyDisplay amount={monthSpent} className="text-xs" /> : DASH}</td>
      <td className="py-1.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
        <InlineMoneyEdit value={mBudget} onSave={(cents) => onSetBudget(tagId, cents)} placeholder="—" className="text-xs" />
      </td>
      <td className={P}>{mBudget !== 0 ? <MoneyDisplay amount={monthBalance} className="text-xs" colorize /> : DASH}</td>
      <td className={P}>{yearSpent !== 0 ? <MoneyDisplay amount={yearSpent} className="text-xs" /> : DASH}</td>
      <td className={P}>{yBudget !== 0 ? <MoneyDisplay amount={yBudget} className="text-xs" colorize={false} /> : DASH}</td>
      <td className={P}>{yBudget !== 0 ? <MoneyDisplay amount={yearBalance} className="text-xs" colorize /> : DASH}</td>
      <td className="py-1.5 px-3 text-right text-xs text-muted-foreground tabular-nums">{mt?.count || "—"}</td>
    </>
  );
}

// Data cells for a group header row
function GroupDataCells({ totals }: {
  totals: { monthSpent: number; monthBudget: number; monthBalance: number; yearSpent: number; yearBudget: number; yearBalance: number; count: number; hasMonth: boolean; hasYear: boolean };
}) {
  return (
    <>
      <td className={P}>{totals.hasMonth ? <MoneyDisplay amount={totals.monthSpent} className="text-xs font-medium" /> : DASH}</td>
      <td className={P}>{totals.monthBudget !== 0 ? <MoneyDisplay amount={totals.monthBudget} className="text-xs font-medium" colorize={false} /> : DASH}</td>
      <td className={P}>{totals.monthBudget !== 0 ? <MoneyDisplay amount={totals.monthBalance} className="text-xs font-medium" colorize /> : DASH}</td>
      <td className={P}>{totals.hasYear ? <MoneyDisplay amount={totals.yearSpent} className="text-xs font-medium" /> : DASH}</td>
      <td className={P}>{totals.yearBudget !== 0 ? <MoneyDisplay amount={totals.yearBudget} className="text-xs font-medium" colorize={false} /> : DASH}</td>
      <td className={P}>{totals.yearBudget !== 0 ? <MoneyDisplay amount={totals.yearBalance} className="text-xs font-medium" colorize /> : DASH}</td>
      <td className="py-1.5 px-3 text-right text-xs text-muted-foreground tabular-nums">{totals.count || "—"}</td>
    </>
  );
}

// Fragment wrapper for table row groups
function GroupRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// Sortable table row with render-prop for drag handle
function SortableTr({ id, className, onClick, children }: {
  id: string;
  className?: string;
  onClick?: () => void;
  children: (dragHandleProps: Record<string, unknown>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging, transition } = useSortable({ id });
  return (
    <tr ref={setNodeRef} className={cn(className, isDragging && "opacity-40")} style={{ transition }} {...attributes} onClick={onClick}>
      {children(listeners ?? {})}
    </tr>
  );
}

// Drag handle grip icon
function DragHandle({ listeners, className }: { listeners: Record<string, unknown>; className?: string }) {
  return (
    <span {...listeners} onClick={(e) => e.stopPropagation()}
      className={cn("cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted/80 text-muted-foreground shrink-0", className)}>
      <GripVertical className="h-3.5 w-3.5" />
    </span>
  );
}

// Reusable inline text input for creating/renaming
function InlineInput({ value, onChange, onSubmit, onCancel, placeholder, className }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; onCancel: () => void; placeholder: string; className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="inline-flex" onClick={(e) => e.stopPropagation()}>
      <input ref={ref} value={value} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        onBlur={() => { if (value.trim()) onSubmit(); else onCancel(); }}
        className={cn("h-6 px-1.5 text-sm bg-background border rounded w-40 outline-none focus:ring-1 focus:ring-primary", className)}
        placeholder={placeholder} />
    </form>
  );
}
