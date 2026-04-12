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
import { useUserPreferences } from "@/lib/user-preferences-context";
import { t } from "@/lib/translations";

type FeedbackType = "BUG" | "FEEDBACK" | "IDEA";

const TYPE_STYLE = {
  BUG: { activeBg: "bg-red-100 border-red-400 text-red-700", icon: Bug },
  FEEDBACK: { activeBg: "bg-blue-100 border-blue-400 text-blue-700", icon: MessageSquare },
  IDEA: { activeBg: "bg-amber-100 border-amber-400 text-amber-700", icon: Lightbulb },
} as const;

export interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const trpc = useTRPC();
  const { preferences } = useUserPreferences();
  const lang = preferences.language;

  const [type, setType] = useState<FeedbackType>("FEEDBACK");
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
    setType("FEEDBACK");
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
      const timer = setTimeout(resetForm, 200);
      return () => clearTimeout(timer);
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
      errorLogs: type === "BUG" ? getRecentErrors() : undefined,
    });
  }

  const typeLabels: Record<FeedbackType, string> = {
    BUG: t(lang, "feedback.bug"),
    FEEDBACK: t(lang, "feedback.feedback"),
    IDEA: t(lang, "feedback.idea"),
  };

  const typePlaceholders: Record<FeedbackType, string> = {
    BUG: t(lang, "feedback.bugPlaceholder"),
    FEEDBACK: t(lang, "feedback.feedbackPlaceholder"),
    IDEA: t(lang, "feedback.ideaPlaceholder"),
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogHeader onClose={handleClose}>
        <DialogTitle>{t(lang, "feedback.title")}</DialogTitle>
      </DialogHeader>

      <DialogBody>
        {submitted ? (
          <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <Check className="h-5 w-5 text-green-600" />
            </div>
            <p className="font-medium text-sm">{t(lang, "feedback.thanks")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type selector */}
            <div className="flex gap-2">
              {(["BUG", "FEEDBACK", "IDEA"] as FeedbackType[]).map((ftype) => {
                const style = TYPE_STYLE[ftype];
                const Icon = style.icon;
                const isActive = type === ftype;
                return (
                  <button
                    key={ftype}
                    type="button"
                    onClick={() => setType(ftype)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-sm font-medium transition-colors",
                      isActive
                        ? style.activeBg
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {typeLabels[ftype]}
                  </button>
                );
              })}
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="fd-title">{t(lang, "feedback.summary")}</Label>
              <Input
                id="fd-title"
                placeholder={t(lang, "feedback.summaryPlaceholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                autoFocus
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="fd-desc">{t(lang, "feedback.details")}</Label>
              <textarea
                id="fd-desc"
                placeholder={typePlaceholders[type]}
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
              {type === "BUG"
                ? t(lang, "feedback.techNoteWithErrors")
                : t(lang, "feedback.techNote")}
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
                  {t(lang, "feedback.sending")}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  {t(lang, "feedback.send")}
                </>
              )}
            </Button>
          </form>
        )}
      </DialogBody>
    </Dialog>
  );
}
