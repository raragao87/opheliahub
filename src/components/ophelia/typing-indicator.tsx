"use client";

import { cn } from "@/lib/utils";

export function TypingIndicator() {
  return (
    <div className="flex items-start gap-2 px-3 py-2">
      <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "block h-1.5 w-1.5 rounded-full bg-muted-foreground/50",
              "animate-bounce"
            )}
            style={{ animationDelay: `${i * 150}ms`, animationDuration: "0.8s" }}
          />
        ))}
      </div>
    </div>
  );
}
