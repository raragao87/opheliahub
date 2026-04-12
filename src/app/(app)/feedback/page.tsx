"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bug, MessageSquare, Lightbulb, ChevronDown, ChevronUp, ExternalLink, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/date";

const ADMIN_EMAIL = "roberto.b.a.aragao@gmail.com";

type FeedbackStatus = "NEW" | "SEEN" | "RESOLVED";
type FeedbackType = "BUG" | "FEEDBACK" | "IDEA" | "all";

const TYPE_CONFIG = {
  BUG: { label: "Bug", icon: Bug, badge: "bg-red-100 text-red-700 border-red-200" },
  FEEDBACK: { label: "Feedback", icon: MessageSquare, badge: "bg-blue-100 text-blue-700 border-blue-200" },
  IDEA: { label: "Idea", icon: Lightbulb, badge: "bg-amber-100 text-amber-700 border-amber-200" },
};

const STATUS_CONFIG: Record<FeedbackStatus, { label: string; badge: string }> = {
  NEW: { label: "New", badge: "bg-orange-100 text-orange-700 border-orange-200" },
  SEEN: { label: "Seen", badge: "bg-slate-100 text-slate-700 border-slate-200" },
  RESOLVED: { label: "Resolved", badge: "bg-green-100 text-green-700 border-green-200" },
};

export default function FeedbackAdminPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<FeedbackType>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Check access
  const sessionQuery = useQuery(trpc.auth.getSession.queryOptions());
  const isAdmin = sessionQuery.data?.user?.email === ADMIN_EMAIL;

  const countsQuery = useQuery({
    ...trpc.feedback.counts.queryOptions(),
    enabled: isAdmin,
  });

  const listQuery = useQuery({
    ...trpc.feedback.list.queryOptions({
      type: typeFilter === "all" ? undefined : typeFilter,
      limit: 50,
    }),
    enabled: isAdmin,
  });

  const updateMutation = useMutation(
    trpc.feedback.updateStatus.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.feedback.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.feedback.counts.queryKey() });
      },
    })
  );

  if (sessionQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center">
        <p className="text-muted-foreground">Access denied.</p>
        <a href="/dashboard" className="text-primary text-sm underline mt-2 inline-block">
          Go to dashboard
        </a>
      </div>
    );
  }

  const counts = countsQuery.data;
  const items = listQuery.data?.items ?? [];

  const tabs: Array<{ key: FeedbackType; label: string; count?: number }> = [
    { key: "all", label: "All", count: counts?.total },
    { key: "BUG", label: "Bugs", count: counts?.bugs },
    { key: "FEEDBACK", label: "Feedback", count: counts?.feedbacks },
    { key: "IDEA", label: "Ideas", count: counts?.ideas },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Feedback</h1>
        {counts && counts.newCount > 0 && (
          <Badge className="bg-orange-100 text-orange-700 border-orange-200">
            {counts.newCount} new
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTypeFilter(tab.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors",
              typeFilter === tab.key
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center",
                  typeFilter === tab.key ? "bg-primary-foreground/20" : "bg-muted"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {listQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No feedback yet.</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const typeConf = TYPE_CONFIG[item.type as keyof typeof TYPE_CONFIG];
            const statusConf = STATUS_CONFIG[item.status as FeedbackStatus] ?? STATUS_CONFIG.NEW;
            const isExpanded = expandedId === item.id;
            const Icon = typeConf?.icon ?? MessageSquare;

            return (
              <Card key={item.id} className={cn(item.status === "NEW" && "border-orange-200")}>
                <CardContent className="p-4">
                  {/* Row */}
                  <div className="flex items-start gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.userName ?? "Unknown"} &middot;{" "}
                          {formatDate(item.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full border",
                          typeConf?.badge
                        )}
                      >
                        {typeConf?.label ?? item.type}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full border",
                          statusConf.badge
                        )}
                      >
                        {statusConf.label}
                      </span>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div className="mt-4 space-y-4 border-t pt-4">
                      {/* Description */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                          Description
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{item.description}</p>
                      </div>

                      {/* Context */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {item.pageUrl && (
                          <div>
                            <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                              Page
                            </p>
                            <a
                              href={item.pageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1 truncate"
                            >
                              {item.pageUrl}
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          </div>
                        )}
                        {item.screenSize && (
                          <div>
                            <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                              Screen
                            </p>
                            <p>{item.screenSize}</p>
                          </div>
                        )}
                        {item.userAgent && (
                          <div className="sm:col-span-2">
                            <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                              Browser
                            </p>
                            <p className="break-all text-muted-foreground">{item.userAgent}</p>
                          </div>
                        )}
                      </div>

                      {/* Error logs */}
                      {item.errorLogs && item.errorLogs !== "[]" && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                            Console errors
                          </p>
                          <pre className="text-xs bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                            {item.errorLogs}
                          </pre>
                        </div>
                      )}

                      {/* Status actions */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs text-muted-foreground mr-1">Mark as:</p>
                        {(["NEW", "SEEN", "RESOLVED"] as FeedbackStatus[]).map((s) => (
                          <Button
                            key={s}
                            variant="outline"
                            size="sm"
                            className={cn(
                              "h-7 text-xs",
                              item.status === s && "opacity-40 cursor-default"
                            )}
                            disabled={item.status === s || updateMutation.isPending}
                            onClick={() => updateMutation.mutate({ id: item.id, status: s })}
                          >
                            {STATUS_CONFIG[s].label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
