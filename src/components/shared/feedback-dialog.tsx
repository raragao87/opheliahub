"use client";

import { useState, useEffect } from "react";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { Bug, Lightbulb, MessageSquare, Loader2, Check } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getRecentErrors } from "@/lib/error-capture";

type FeedbackType = "bug" | "feedback" | "idea";

const TYPE_CONFIG = {
  bug: {
    label: "Bug",
    icon: Bug,
    placeholder: "What happened? What did you expect to happen?",
    activeBg: "bg-red-100 border-red-400 text-red-700",
  },
  feedback: {
    label: "Feedback",
    icon: MessageSquare,
    placeholder: "What could be better? Any suggestions?",
    activeBg: "bg-blue-100 border-blue-400 text-blue-700",
  },
  idea: {
    label: "Idea",
    icon: Lightbulb,
    placeholder: "Describe your idea...",
    activeBg: "bg-amber-100 border-amber-400 text-amber-700",
  },
} as const;

export interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const trpc = useTRPC();
  const [type, setType] = useState<FeedbackType>("feedback");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation(
    trpc.feedback.submit.mutationOptions({
      onSuccess: () => {
        setSubmitted(true);
        setTimeout(() => {
          onOpenChange(false);
        }, 1500);
      },
      onError: (err) => {
        toast.error(err.message ?? "Failed to submit. Please try again.");
      },
    })
  );

  function resetForm() {
    setType("feedback");
    setTitle("");
    setDescription("");
    setSubmitted(false);
  }

  function handleClose() {
    if (submitMutation.isPending) return;
    onOpenChange(false);
  }

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      // Delay reset so the closing animation isn't interrupted
      const t = setTimeout(resetForm, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim() || submitMutation.isPending) return;

    submitMutation.mutate({
      type,
      title: title.trim(),
      description: description.trim(),
      pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      screenSize:
        typeof window !== "undefined"
          ? `${window.innerWidth}x${window.innerHeight}`
          : undefined,
      errorLogs: type === "bug" ? getRecentErrors() : undefined,
    });
  }

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogHeader onClose={handleClose}>
        <DialogTitle>Send feedback</DialogTitle>
      </DialogHeader>

      <DialogBody>
        {submitted ? (
          <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <Check className="h-5 w-5 text-green-600" />
            </div>
            <p className="font-medium text-sm">Thanks! Your feedback has been submitted.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type selector */}
            <div className="flex gap-2">
              {(["bug", "feedback", "idea"] as FeedbackType[]).map((t) => {
                const config = TYPE_CONFIG[t];
                const Icon = config.icon;
                const isActive = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-sm font-medium transition-colors",
                      isActive
                        ? config.activeBg
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {config.label}
                  </button>
                );
              })}
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="fd-title">Summary</Label>
              <Input
                id="fd-title"
                placeholder="Brief summary"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                autoFocus
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="fd-desc">Details</Label>
              <textarea
                id="fd-desc"
                placeholder={TYPE_CONFIG[type].placeholder}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                rows={4}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none min-h-[100px]"
              />
            </div>

            {/* Note */}
            <p className="text-xs text-muted-foreground">
              Technical info (page URL, browser
              {type === "bug" ? ", recent errors" : ""}) will be included
              automatically to help us debug.
            </p>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full"
              disabled={!title.trim() || !description.trim() || submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Send feedback
                </>
              )}
            </Button>
          </form>
        )}
      </DialogBody>
    </Dialog>
  );
}
