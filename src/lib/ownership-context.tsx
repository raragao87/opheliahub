"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type Visibility = "SHARED" | "PERSONAL";

interface OwnershipContextValue {
  visibility: Visibility;
  setVisibility: (v: Visibility) => void;
  /** Alias kept for backward-compat — always returns the current visibility */
  visibilityParam: Visibility;
  /** Returns true if accounts/transactions with this ownership should be visible */
  isVisible: (ownership: Visibility) => boolean;
}

const OwnershipContext = createContext<OwnershipContextValue | null>(null);

export function OwnershipProvider({ children }: { children: ReactNode }) {
  const [visibility, setVisibility] = useState<Visibility>("SHARED");

  const isVisible = useCallback(
    (ownership: Visibility) => ownership === visibility,
    [visibility]
  );

  return (
    <OwnershipContext.Provider
      value={{ visibility, setVisibility, visibilityParam: visibility, isVisible }}
    >
      {children}
    </OwnershipContext.Provider>
  );
}

export function useOwnership() {
  const ctx = useContext(OwnershipContext);
  if (!ctx) throw new Error("useOwnership must be used within OwnershipProvider");
  return ctx;
}
