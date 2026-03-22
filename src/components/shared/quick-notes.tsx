"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { StickyNote, X, Plus, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function QuickNotes() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [content, setContent] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef("");

  // Load most recent note when opened
  const latestQuery = useQuery({
    ...trpc.notes.getLatest.queryOptions(),
    enabled: isOpen,
  });

  const saveMutation = useMutation(
    trpc.notes.save.mutationOptions({
      onMutate: () => setSaveStatus("saving"),
      onSuccess: () => {
        setSaveStatus("saved");
        queryClient.invalidateQueries({ queryKey: trpc.notes.getLatest.queryOptions().queryKey });
      },
      onError: () => setSaveStatus("unsaved"),
    })
  );

  const createMutation = useMutation(
    trpc.notes.create.mutationOptions({
      onSuccess: (newNote) => {
        setContent("");
        contentRef.current = "";
        setNoteId(newNote.id);
        setSaveStatus("saved");
        queryClient.invalidateQueries({ queryKey: trpc.notes.getLatest.queryOptions().queryKey });
        textareaRef.current?.focus();
      },
    })
  );

  // Initialize content when data loads
  useEffect(() => {
    if (latestQuery.data) {
      setContent(latestQuery.data.content);
      contentRef.current = latestQuery.data.content;
      setNoteId(latestQuery.data.id);
      setSaveStatus("saved");
    } else if (latestQuery.data === null && !latestQuery.isLoading) {
      createMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestQuery.data, latestQuery.isLoading]);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen && noteId) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen, noteId]);

  // Debounced auto-save
  const handleChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      contentRef.current = newContent;
      setSaveStatus("unsaved");

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        if (noteId) {
          saveMutation.mutate({ id: noteId, content: newContent });
        }
      }, 800);
    },
    [noteId, saveMutation]
  );

  // Force save helper
  const forceSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (noteId && contentRef.current !== latestQuery.data?.content) {
      saveMutation.mutate({ id: noteId, content: contentRef.current });
    }
  }, [noteId, saveMutation, latestQuery.data?.content]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        forceSave();
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, forceSave]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        forceSave();
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, forceSave]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const handleNewNote = () => {
    forceSave();
    createMutation.mutate();
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-center h-8 w-8 rounded-md transition-colors",
          isOpen
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
        title="Notes"
      >
        <StickyNote className="h-4 w-4" />
      </button>

      {/* Floating card */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-[320px] max-h-[420px] max-sm:w-[calc(100vw-2rem)] max-sm:max-h-[60vh] rounded-lg border bg-card shadow-lg flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold">Notes</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleNewNote}
                disabled={createMutation.isPending}
                className="flex items-center justify-center h-6 w-6 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="New note"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  forceSave();
                  setIsOpen(false);
                }}
                className="flex items-center justify-center h-6 w-6 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Close notes"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="Jot down notes during your budget review..."
              className="w-full min-h-[300px] p-3 text-sm leading-relaxed bg-transparent resize-none outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-3 py-1.5 border-t flex-shrink-0">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              {saveStatus === "saving" && (
                <>
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  Saving...
                </>
              )}
              {saveStatus === "saved" && (
                <>
                  <Check className="h-2.5 w-2.5" />
                  Saved
                </>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
