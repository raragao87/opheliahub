"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { FeedbackDialog } from "@/components/shared/feedback-dialog";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Give feedback"
        title="Give feedback"
        className={cn(
          "fixed bottom-6 right-6 z-40",
          "h-12 w-12 rounded-full shadow-lg",
          "bg-primary text-primary-foreground",
          "flex items-center justify-center",
          "hover:scale-110 active:scale-95 transition-transform",
          "animate-in fade-in duration-500"
        )}
      >
        <MessageSquarePlus className="h-5 w-5" />
      </button>
      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
