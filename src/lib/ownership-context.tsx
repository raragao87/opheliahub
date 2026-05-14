"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type BudgetScope = "SHARED" | "PERSONAL";

interface OwnershipContextValue {
  budgetScope: BudgetScope;
  setBudgetScope: (v: BudgetScope) => void;
  budgetScopeParam: BudgetScope;
  isVisible: (ownership: BudgetScope) => boolean;
}

const OwnershipContext = createContext<OwnershipContextValue | null>(null);

export function OwnershipProvider({ children }: { children: ReactNode }) {
  const [budgetScope, setBudgetScope] = useState<BudgetScope>("SHARED");

  const isVisible = useCallback(
    (ownership: BudgetScope) => ownership === budgetScope,
    [budgetScope]
  );

  return (
    <OwnershipContext.Provider
      value={{ budgetScope, setBudgetScope, budgetScopeParam: budgetScope, isVisible }}
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
