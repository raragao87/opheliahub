"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useOwnership } from "@/lib/ownership-context";
import { getPageConfig, type PageContext } from "./page-context";

interface OpheliaChatContextValue {
  pageContext: PageContext;
  setPageSummary: (summary: string) => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const OpheliaChatContext = createContext<OpheliaChatContextValue | null>(null);

export function OpheliaChatProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { visibilityParam } = useOwnership();
  const [isOpen, setIsOpen] = useState(false);
  const [pageSummary, setPageSummary] = useState<string | undefined>(undefined);

  // Reset summary when navigating
  useEffect(() => {
    setPageSummary(undefined);
  }, [pathname]);

  const pageContext = useMemo<PageContext>(() => {
    const config = getPageConfig(pathname);
    return {
      path: pathname,
      pageName: config.pageName,
      visibility: visibilityParam ?? "SHARED",
      summary: pageSummary,
      suggestedPrompts: config.suggestedPrompts,
    };
  }, [pathname, visibilityParam, pageSummary]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const value = useMemo<OpheliaChatContextValue>(
    () => ({ pageContext, setPageSummary, isOpen, open, close, toggle }),
    [pageContext, isOpen, open, close, toggle]
  );

  return (
    <OpheliaChatContext.Provider value={value}>
      {children}
    </OpheliaChatContext.Provider>
  );
}

export function useOpheliaChat() {
  const ctx = useContext(OpheliaChatContext);
  if (!ctx) throw new Error("useOpheliaChat must be used within OpheliaChatProvider");
  return ctx;
}
