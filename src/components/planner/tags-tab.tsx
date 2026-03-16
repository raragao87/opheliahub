"use client";

import { useState, useMemo } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { MoneyDisplay } from "@/components/shared/money-display";
import { TagAnalysisPanel } from "./tag-analysis-panel";
import { cn } from "@/lib/utils";
import { Tag, BarChart3, ChevronDown } from "lucide-react";

interface TagsTabProps {
  month: number;
  year: number;
  visibility: "SHARED" | "PERSONAL";
}

export function TagsTab({ visibility }: TagsTabProps) {
  const trpc = useTRPC();

  const tagsQuery = useQuery(trpc.tag.list.queryOptions({ visibility }));
  const tagGroupsQuery = useQuery(trpc.tag.listGroups.queryOptions({ visibility }));

  const allTags = tagsQuery.data ?? [];
  const tagGroups = tagGroupsQuery.data ?? [];

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [analysisTarget, setAnalysisTarget] = useState<{ type: "group" | "tag"; id: string; name: string } | null>(null);

  // Group tags by their group
  const groupedData = useMemo(() => {
    const groups = tagGroups.map((g) => ({
      ...g,
      tags: allTags.filter((t) => t.groupId === g.id),
    }));
    const ungrouped = allTags.filter((t) => !t.groupId);
    return { groups, ungrouped };
  }, [allTags, tagGroups]);

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (allTags.length === 0 && !tagsQuery.isLoading) {
    return (
      <div className="text-center py-12 space-y-3">
        <Tag className="h-10 w-10 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground">
          No tags created yet. Add tags to your transactions to analyze spending by trip, subscription, project, or event.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tag list with groups */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Tag</th>
              <th className="text-right py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24">Transactions</th>
              <th className="text-right py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-10" />
            </tr>
          </thead>
          <tbody>
            {groupedData.groups.map((group) => {
              const isCollapsed = collapsedGroups.has(group.id);
              const groupTxnCount = group.tags.reduce((s, t) => s + (t._count?.transactions ?? 0), 0);
              const isAnalysisActive = analysisTarget?.type === "group" && analysisTarget.id === group.id;
              return (
                <GroupRows key={group.id}>
                  {/* Group header */}
                  <tr className={cn("border-b border-border/50 hover:bg-muted/20 group/row", isAnalysisActive && "bg-primary/5")}>
                    <td className="py-2 px-4">
                      <button onClick={() => toggleGroup(group.id)} className="flex items-center gap-2 text-left w-full">
                        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", isCollapsed && "-rotate-90")} />
                        {group.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />}
                        <span className="font-semibold text-sm">{group.name}</span>
                      </button>
                    </td>
                    <td className="py-2 px-4 text-right text-xs text-muted-foreground tabular-nums">{groupTxnCount}</td>
                    <td className="py-2 px-4 text-right">
                      <button
                        onClick={() => setAnalysisTarget(
                          isAnalysisActive ? null : { type: "group", id: group.id, name: group.name }
                        )}
                        title="Analyze this group"
                        className={cn(
                          "p-1 rounded transition-colors",
                          isAnalysisActive
                            ? "text-primary bg-primary/10"
                            : "text-muted-foreground/40 hover:text-foreground hover:bg-muted opacity-0 group-hover/row:opacity-100"
                        )}
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                  {/* Tags in group */}
                  {!isCollapsed && group.tags.map((tag) => {
                    const isTagActive = analysisTarget?.type === "tag" && analysisTarget.id === tag.id;
                    return (
                      <tr key={tag.id} className={cn("border-b border-border/30 hover:bg-muted/20 group/row", isTagActive && "bg-primary/5")}>
                        <td className="py-1.5 px-4 pl-10">
                          <span className="text-sm">{tag.name}</span>
                        </td>
                        <td className="py-1.5 px-4 text-right text-xs text-muted-foreground tabular-nums">{tag._count?.transactions ?? 0}</td>
                        <td className="py-1.5 px-4 text-right">
                          <button
                            onClick={() => setAnalysisTarget(
                              isTagActive ? null : { type: "tag", id: tag.id, name: tag.name }
                            )}
                            title="Analyze this tag"
                            className={cn(
                              "p-1 rounded transition-colors",
                              isTagActive
                                ? "text-primary bg-primary/10"
                                : "text-muted-foreground/40 hover:text-foreground hover:bg-muted opacity-0 group-hover/row:opacity-100"
                            )}
                          >
                            <BarChart3 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </GroupRows>
              );
            })}

            {/* Ungrouped tags */}
            {groupedData.ungrouped.map((tag) => {
              const isTagActive = analysisTarget?.type === "tag" && analysisTarget.id === tag.id;
              return (
                <tr key={tag.id} className={cn("border-b border-border/30 hover:bg-muted/20 group/row", isTagActive && "bg-primary/5")}>
                  <td className="py-1.5 px-4">
                    <span className="text-sm">{tag.name}</span>
                  </td>
                  <td className="py-1.5 px-4 text-right text-xs text-muted-foreground tabular-nums">{tag._count?.transactions ?? 0}</td>
                  <td className="py-1.5 px-4 text-right">
                    <button
                      onClick={() => setAnalysisTarget(
                        isTagActive ? null : { type: "tag", id: tag.id, name: tag.name }
                      )}
                      title="Analyze this tag"
                      className={cn(
                        "p-1 rounded transition-colors",
                        isTagActive
                          ? "text-primary bg-primary/10"
                          : "text-muted-foreground/40 hover:text-foreground hover:bg-muted opacity-0 group-hover/row:opacity-100"
                      )}
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Analysis panel */}
      {analysisTarget && (
        <TagAnalysisPanel
          target={analysisTarget}
          visibility={visibility}
          onClose={() => setAnalysisTarget(null)}
          onSelectTag={(id, name) => setAnalysisTarget({ type: "tag", id, name })}
        />
      )}
    </div>
  );
}

// Fragment wrapper for table row groups
function GroupRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
