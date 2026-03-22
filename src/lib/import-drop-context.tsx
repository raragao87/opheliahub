"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";

interface PendingImport {
  accountId: string;
  accountName: string;
  file: File;
}

interface ImportDropContextValue {
  pendingImport: PendingImport | null;
  setPendingImport: (pending: PendingImport) => void;
  /** Read once and clear — prevents stale state on subsequent visits to import page */
  consumePendingImport: () => PendingImport | null;
}

const ImportDropContext = createContext<ImportDropContextValue>({
  pendingImport: null,
  setPendingImport: () => {},
  consumePendingImport: () => null,
});

export function ImportDropProvider({ children }: { children: ReactNode }) {
  const [pendingImport, setPendingImportState] = useState<PendingImport | null>(null);
  const pendingRef = useRef<PendingImport | null>(null);

  const setPendingImport = useCallback((pending: PendingImport) => {
    pendingRef.current = pending;
    setPendingImportState(pending);
  }, []);

  const consumePendingImport = useCallback(() => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPendingImportState(null);
    return current;
  }, []);

  return (
    <ImportDropContext.Provider value={{ pendingImport, setPendingImport, consumePendingImport }}>
      {children}
    </ImportDropContext.Provider>
  );
}

export function useImportDrop() {
  return useContext(ImportDropContext);
}
