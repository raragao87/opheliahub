"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MoneyDisplay } from "@/components/shared/money-display";
import { VisibilityBadge } from "@/components/shared/visibility-badge";
import { formatDate } from "@/lib/date";
import { parseCsvFile, transformCsvToTransactions, type AmountColumnHints, type ColumnMapping, type ParsedTransaction } from "@/lib/parsers/csv-parser";
import { parseMT940 } from "@/lib/parsers/mt940-parser";
import type { FileStructureAnalysis } from "@/lib/ophelia/types";
import { Upload, FileText, ArrowRight, ArrowLeft, Check, AlertTriangle, ChevronRight, Filter, Pencil, Loader2, Sparkles, Tag as TagIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { extractDisplayName } from "@/lib/recurring";
import { ACCOUNT_TYPE_META } from "@/lib/account-types";
import { useImportDrop } from "@/lib/import-drop-context";
import { toast } from "sonner";

type Step = "upload" | "mapping" | "filter" | "preview" | "confirm";

/**
 * Scans rows from an Excel sheet (as string[][]) to find the first row that
 * looks like a column header row, skipping bank-statement metadata rows.
 * Returns the 0-based row index to start from.
 */
function detectExcelHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    const nonEmpty = row.filter((c) => String(c).trim() !== "");
    if (nonEmpty.length < 3) continue; // too few columns to be a header
    const looksLikeHeaders = nonEmpty.every((c) => {
      const s = String(c).trim();
      if (/^[\d.,\s-]+$/.test(s)) return false; // pure numeric value
      if (s.length > 60) return false; // too long for a column header
      return true;
    });
    if (looksLikeHeaders) return i;
  }
  return 0;
}

/** Small colored dot showing Ophelia confidence (green / yellow / red). */
function ConfidenceDot({ confidence }: { confidence: number | undefined }) {
  if (confidence === undefined) return null;
  const cls =
    confidence >= 0.8
      ? "bg-green-500"
      : confidence >= 0.5
      ? "bg-yellow-400"
      : "bg-red-400";
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${cls} shrink-0`}
      title={`Ophelia confidence: ${Math.round(confidence * 100)}%`}
    />
  );
}

export default function ImportPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const accountsQuery = useQuery(trpc.account.list.queryOptions());
  const categoriesQuery = useQuery(trpc.category.list.queryOptions());
  const tagsQuery = useQuery(trpc.tag.list.queryOptions({ includeArchived: false }));

  const [step, setStep] = useState<Step>("upload");
  const [accountId, setAccountId] = useState("");
  const [format, setFormat] = useState<"CSV" | "MT940">("CSV");
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [defaultVisibility, setDefaultVisibility] = useState<"SHARED" | "PERSONAL">("SHARED");

  // CSV specific
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ date: "", description: "", amount: "" });
  const [amountMode, setAmountMode] = useState<"SINGLE" | "SPLIT">("SINGLE");
  const [invertAmounts, setInvertAmounts] = useState(false);
  const [delimiter, setDelimiter] = useState(",");

  // Ophelia AI column analysis
  const [opheliaLoading, setOpheliaLoading] = useState(false);
  const [opheliaAnalysis, setOpheliaAnalysis] = useState<FileStructureAnalysis | null>(null);

  // Unknown-format fallback: set when Ophelia extracted transactions from an
  // unrecognized file. The warning text is shown as a banner in preview.
  const [opheliaFallbackWarning, setOpheliaFallbackWarning] = useState<string | null>(null);
  // True when the uploaded file has an extension we don't recognize
  const [isUnknownFormat, setIsUnknownFormat] = useState(false);

  // Per-transaction category and tag overrides (index → id / ids)
  const [categoryOverrides, setCategoryOverrides] = useState<Record<number, string>>({});
  const [tagOverrides, setTagOverrides] = useState<Record<number, string[]>>({});

  // Filter step state
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [collapsedFilterColumns, setCollapsedFilterColumns] = useState<Set<string>>(new Set());

  // Parsed transactions
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [errors, setErrors] = useState<{ row: number; message: string }[]>([]);
  // Definite duplicates (exact externalId match or description-similar)
  const [duplicateIndices, setDuplicateIndices] = useState<number[]>([]);
  // AI-resolved fuzzy duplicates (same amount+date, different description)
  interface FuzzyDuplicate {
    index: number;
    isDuplicate: boolean | null; // null = AI couldn't decide → user decides
    confidence: number;
    reasoning: string;
    matchedDescription: string;
  }
  const [fuzzyDuplicates, setFuzzyDuplicates] = useState<FuzzyDuplicate[]>([]);
  // Indices the user has explicitly said "import anyway" despite duplicate flag
  const [importAnywayIndices, setImportAnywayIndices] = useState<Set<number>>(new Set());

  // Display name overrides (index → custom name)
  const [displayNameOverrides, setDisplayNameOverrides] = useState<Record<number, string>>({});
  const [editingDisplayNameIdx, setEditingDisplayNameIdx] = useState<number | null>(null);

  // Profile persistence
  const [savedProfileLoaded, setSavedProfileLoaded] = useState(false);

  // Smart duplicate detection state
  type DuplicateFlag = "duplicate" | "sameAmount" | "similar" | null;
  const [duplicateFlags, setDuplicateFlags] = useState<DuplicateFlag[]>([]);
  const [importContextData, setImportContextData] = useState<{
    lastTransactionDate: string | null;
    lastImportDate: string | null;
    lastImportFileName: string | null;
    lastImportRowCount: number;
    overlapDays: number;
    hasGap: boolean;
    gapStart: string | null;
    gapEnd: string | null;
    dateComparison: { date: string; inFile: number; inDb: number }[];
  } | null>(null);

  // Drag-and-drop
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dropZoneDragCounter = useRef(0);

  // Sidebar drop-to-import
  const { consumePendingImport } = useImportDrop();
  const [pendingAutoAdvance, setPendingAutoAdvance] = useState(false);
  const sidebarDropConsumed = useRef(false);
  const [pendingSidebarDrop, setPendingSidebarDrop] = useState<{
    accountId: string;
    accountName: string;
    file: File;
  } | null>(null);

  const commitMutation = useMutation(
    trpc.import.commit.mutationOptions()
  );

  const checkDuplicatesMutation = useMutation(
    trpc.import.checkDuplicates.mutationOptions({
      onSuccess: (data) => {
        setDuplicateIndices(data.duplicates);
        setFuzzyDuplicates(data.fuzzy ?? []);
      },
    })
  );

  const saveProfileMutation = useMutation(
    trpc.import.saveProfile.mutationOptions()
  );

  const [unknownFormatError, setUnknownFormatError] = useState<string | null>(null);
  const extractUnknownMutation = useMutation(
    trpc.ophelia.extractUnknownFormat.mutationOptions({
      onSuccess: (result) => {
        if (!result) {
          setUnknownFormatError(
            "Ophelia is not available. We couldn't recognize this file format. Please convert it to CSV and try again."
          );
          return;
        }
        if (result.confidence < 0.5 || result.transactions.length === 0) {
          setUnknownFormatError(
            result.transactions.length === 0
              ? `Ophelia couldn't find any transactions in this file (format guess: ${result.formatGuess}). Please convert it to CSV and try again.`
              : `Ophelia extracted ${result.transactions.length} transactions but confidence is low (${Math.round(result.confidence * 100)}% — format: ${result.formatGuess}). Please convert to CSV for a more reliable import.`
          );
          return;
        }

        // Convert Ophelia's output to ParsedTransaction format
        const txs: import("@/lib/parsers/csv-parser").ParsedTransaction[] = result.transactions
          .map((t) => {
            const d = new Date(t.date);
            if (isNaN(d.getTime())) return null;
            const amountCents = Math.round(t.amount * 100);
            return {
              date: d,
              description: t.description,
              amount: amountCents,
              type: (amountCents >= 0 ? "INCOME" : "EXPENSE") as "INCOME" | "EXPENSE",
            };
          })
          .filter((t): t is NonNullable<typeof t> => t !== null);

        const warnings = [
          `Ophelia detected this as: ${result.formatGuess} (${Math.round(result.confidence * 100)}% confidence).`,
          ...result.warnings,
          "Please review all transactions carefully before confirming the import.",
        ].join(" ");

        setOpheliaFallbackWarning(warnings);
        handleGoToPreview(txs, []);
      },
      onError: (err) => setUnknownFormatError(err.message),
    })
  );

  /** Try to find a unique account matching an institution name. Returns the account id or undefined. */
  const findAccountByInstitution = (institution: string): string | undefined => {
    const accounts = accountsQuery.data ?? [];
    const needle = institution.toLowerCase().trim();
    const matches = accounts.filter((a) => {
      const name = a.name.toLowerCase();
      const inst = (a.institution ?? "").toLowerCase();
      return (
        name.includes(needle) ||
        inst.includes(needle) ||
        needle.includes(name) ||
        (inst.length > 2 && needle.includes(inst))
      );
    });
    return matches.length === 1 ? matches[0].id : undefined;
  };

  const analyzeFileMutation = useMutation(
    trpc.ophelia.analyzeFile.mutationOptions({
      onSuccess: (analysis) => {
        setOpheliaLoading(false);
        if (!analysis) return;
        setOpheliaAnalysis(analysis);

        // Auto-detect target account from institution name (only if user hasn't picked one yet)
        if (analysis.detectedInstitution && !accountId) {
          const matched = findAccountByInstitution(analysis.detectedInstitution);
          if (matched) handleAccountChange(matched);
        }

        // Pre-fill column mapping from Ophelia suggestions (confidence > 0.4)
        const byMapped = (key: string) =>
          analysis.detectedFields.find(
            (f) => f.mappedTo === key && f.confidence > 0.4
          );

        const dateF = byMapped("date");
        const descF = byMapped("description") ?? byMapped("counterpartyName");
        const amtF = byMapped("amount");
        const debitF = byMapped("debit");
        const creditF = byMapped("credit");

        if (debitF && creditF) {
          setAmountMode("SPLIT");
          setMapping({
            date: dateF ? String(dateF.sourceColumn) : "",
            description: descF ? String(descF.sourceColumn) : "",
            amount: "",
            debit: String(debitF.sourceColumn),
            credit: String(creditF.sourceColumn),
          });
        } else {
          setAmountMode("SINGLE");
          setMapping({
            date: dateF ? String(dateF.sourceColumn) : "",
            description: descF ? String(descF.sourceColumn) : "",
            amount: amtF ? String(amtF.sourceColumn) : "",
          });
        }
      },
      onError: () => setOpheliaLoading(false),
    })
  );

  /** Returns Ophelia's confidence for a given mapping field when the current
   *  dropdown value matches what Ophelia suggested. */
  const opheliaConf = (mappedTo: "date" | "description" | "amount" | "debit" | "credit"): number | undefined => {
    if (!opheliaAnalysis) return undefined;
    const currentValue =
      mappedTo === "date"        ? mapping.date
      : mappedTo === "description" ? mapping.description
      : mappedTo === "amount"      ? mapping.amount
      : mappedTo === "debit"       ? (mapping.debit ?? "")
      :                             (mapping.credit ?? "");
    if (!currentValue) return undefined;
    const matchedMappedTos =
      mappedTo === "description"
        ? ["description", "counterpartyName"]
        : [mappedTo];
    const field = opheliaAnalysis.detectedFields.find(
      (f) =>
        matchedMappedTos.includes(f.mappedTo) &&
        String(f.sourceColumn) === currentValue
    );
    return field?.confidence;
  };

  const processFile = useCallback((file: File) => {
    const name = file.name.toLowerCase();
    setFileName(file.name);
    // Reset Ophelia state whenever a new file is chosen
    setOpheliaAnalysis(null);
    setOpheliaLoading(false);
    setIsUnknownFormat(false);
    setUnknownFormatError(null);
    setOpheliaFallbackWarning(null);

    // ── MT940 ──────────────────────────────────────────────────────────────
    if (name.endsWith(".mt940") || name.endsWith(".sta") || name.endsWith(".940")) {
      setFormat("MT940");
      const reader = new FileReader();
      reader.onload = (ev) => setFileContent(ev.target?.result as string);
      reader.readAsText(file);
      return;
    }

    // ── Excel (.xls / .xlsx) ───────────────────────────────────────────────
    if (name.endsWith(".xls") || name.endsWith(".xlsx")) {
      setFormat("CSV");
      setDelimiter(",");
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const buffer = new Uint8Array(ev.target?.result as ArrayBuffer);
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buffer, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const allRows = XLSX.utils.sheet_to_json<string[]>(ws, {
          header: 1,
          defval: "",
        }) as string[][];

        // Skip metadata rows (e.g., Amex XLSX has 5 info rows before the real header)
        const headerIdx = detectExcelHeaderRow(allRows);
        const dataRows = allRows.slice(headerIdx);

        // Serialize to CSV
        const csv = dataRows
          .map((r) =>
            r
              .map((c) => {
                const s = String(c);
                return s.includes(",") || s.includes('"') || s.includes("\n")
                  ? `"${s.replace(/"/g, '""')}"`
                  : s;
              })
              .join(",")
          )
          .join("\n");

        setFileContent(csv);
        const result = parseCsvFile(csv, ",");
        setCsvHeaders(result.headers);
        setCsvRows(result.rows);
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    // ── TSV ────────────────────────────────────────────────────────────────
    if (name.endsWith(".tsv")) {
      setFormat("CSV");
      setDelimiter("\t");
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        setFileContent(content);
        const result = parseCsvFile(content, "\t");
        setCsvHeaders(result.headers);
        setCsvRows(result.rows);
      };
      reader.readAsText(file);
      return;
    }

    // ── Plain CSV ──────────────────────────────────────────────────────────
    if (name.endsWith(".csv") || name.endsWith(".txt")) {
      setFormat("CSV");
      setDelimiter(",");
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        setFileContent(content);
        const result = parseCsvFile(content);
        setCsvHeaders(result.headers);
        setCsvRows(result.rows);
      };
      reader.readAsText(file);
      return;
    }

    // ── Unknown format → Ophelia fallback ────────────────────────────────
    setIsUnknownFormat(true);
    const reader = new FileReader();
    reader.onload = (ev) => setFileContent(ev.target?.result as string ?? "");
    reader.readAsText(file);
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneDragCounter.current++;
    if (dropZoneDragCounter.current === 1) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneDragCounter.current--;
    if (dropZoneDragCounter.current <= 0) {
      dropZoneDragCounter.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneDragCounter.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  // ── Sidebar drop-to-import: consume pending import on mount ──
  useEffect(() => {
    if (sidebarDropConsumed.current) return;
    const pending = consumePendingImport();
    if (!pending) return;
    sidebarDropConsumed.current = true;
    setPendingSidebarDrop(pending);
    // Process the file immediately (FileReader is async, will update state)
    processFile(pending.file);
    toast.info(`Importing to ${pending.accountName}`, { duration: 2000 });
    setStep("mapping");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once accounts data is loaded AND we have a pending sidebar drop, set the account
  useEffect(() => {
    if (!pendingSidebarDrop) return;
    if (!accountsQuery.data) return; // wait for accounts to load

    const drop = pendingSidebarDrop;
    setPendingSidebarDrop(null);

    // handleAccountChange is async (loads profile) — wait for it before auto-advancing
    handleAccountChange(drop.accountId).then(() => {
      setPendingAutoAdvance(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSidebarDrop, accountsQuery.data]);

  // Auto-advance when sidebar drop + file + profile are all ready
  useEffect(() => {
    if (!pendingAutoAdvance) return;
    if (!fileContent || !accountId) return;

    // For MT940, go straight to preview
    if (format === "MT940") {
      const result = parseMT940(fileContent);
      handleGoToPreview(
        result.transactions,
        result.errors.map((msg, i) => ({ row: i, message: msg }))
      );
      setPendingAutoAdvance(false);
      return;
    }

    // For CSV: need headers to be parsed first
    if (csvHeaders.length === 0) return;

    // CSV with saved profile: auto-advance to filter
    if (savedProfileLoaded) {
      handleGoToFilter();
      setPendingAutoAdvance(false);
      return;
    }

    // CSV without saved profile: trigger Ophelia and stay on mapping
    const sampleLines = fileContent
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .slice(0, 30)
      .join("\n");
    setOpheliaLoading(true);
    setOpheliaAnalysis(null);
    analyzeFileMutation.mutate({
      rawContent: sampleLines,
      filename: fileName,
      delimiter,
    });
    setPendingAutoAdvance(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoAdvance, fileContent, accountId, format, savedProfileLoaded, csvHeaders.length]);

  // Derive filterable columns (low cardinality only)
  const filterableColumns = useMemo(() => {
    const MAX_CARDINALITY = 50;
    const result: { column: string; values: string[]; valueCounts: Record<string, number> }[] = [];
    for (const header of csvHeaders) {
      const valueCounts: Record<string, number> = {};
      let exceeded = false;
      for (const row of csvRows) {
        const val = row[header]?.trim() ?? "";
        if (!(val in valueCounts) && Object.keys(valueCounts).length >= MAX_CARDINALITY) {
          exceeded = true;
          break;
        }
        valueCounts[val] = (valueCounts[val] ?? 0) + 1;
      }
      if (!exceeded && Object.keys(valueCounts).length > 0) {
        const sorted = Object.keys(valueCounts).sort((a, b) => {
          if (a === "") return 1;
          if (b === "") return -1;
          return a.localeCompare(b);
        });
        result.push({ column: header, values: sorted, valueCounts });
      }
    }
    return result;
  }, [csvHeaders, csvRows]);

  // Fast O(1) lookup: column name → filterableColumns entry
  const filterableByColumn = useMemo(
    () => new Map(filterableColumns.map((fc) => [fc.column, fc])),
    [filterableColumns]
  );

  // Derive filtered rows from column filters
  const filteredCsvRows = useMemo(() => {
    if (Object.keys(columnFilters).length === 0) return csvRows;
    return csvRows.filter((row) => {
      for (const [column, selectedValues] of Object.entries(columnFilters)) {
        const cellValue = row[column]?.trim() ?? "";
        if (!selectedValues.has(cellValue)) return false;
      }
      return true;
    });
  }, [csvRows, columnFilters]);

  const handleGoToFilter = useCallback(async () => {
    const initialFilters: Record<string, Set<string>> = {};
    for (const { column, values } of filterableColumns) {
      initialFilters[column] = new Set(values);
    }

    // If we have a saved profile with filter settings, restore them
    if (savedProfileLoaded && accountId) {
      try {
        const profile = await queryClient.fetchQuery(
          trpc.import.getProfile.queryOptions({ accountId, format })
        );
        if (profile?.columnFilters) {
          const savedFilters = profile.columnFilters as Record<string, string[]>;
          // Saved filters store EXCLUDED values. Reconstruct selected values.
          for (const [column, excludedValues] of Object.entries(savedFilters)) {
            const allValues = initialFilters[column];
            if (allValues) {
              const excluded = new Set(excludedValues);
              const selected = new Set<string>();
              for (const v of allValues) {
                if (!excluded.has(v)) selected.add(v);
              }
              initialFilters[column] = selected;
            }
          }
        }
      } catch {
        // Ignore — use default all-selected
      }
    }

    setColumnFilters(initialFilters);
    setCollapsedFilterColumns(new Set());
    setStep("filter");
  }, [filterableColumns, savedProfileLoaded, accountId, format, queryClient, trpc.import.getProfile]);

  /** When the user picks an account, auto-set visibility, load saved profile. */
  const handleAccountChange = useCallback(async (newAccountId: string) => {
    setAccountId(newAccountId);
    setSavedProfileLoaded(false);
    const account = (accountsQuery.data ?? []).find((a) => a.id === newAccountId);
    if (account) {
      setDefaultVisibility(account.ownership as "SHARED" | "PERSONAL");
      const meta = ACCOUNT_TYPE_META[account.type];
      setInvertAmounts(meta?.isLiability ?? false);
    }

    // Try to load a saved profile for this account+format
    if (newAccountId) {
      try {
        const profile = await queryClient.fetchQuery(
          trpc.import.getProfile.queryOptions({ accountId: newAccountId, format })
        );
        if (profile) {
          const savedMapping = profile.columnMapping as Record<string, string>;
          setMapping({
            date: savedMapping.date ?? "",
            description: savedMapping.description ?? "",
            amount: savedMapping.amount ?? "",
            debit: savedMapping.debit,
            credit: savedMapping.credit,
          });
          setAmountMode(profile.amountMode as "SINGLE" | "SPLIT");
          setInvertAmounts(profile.invertAmounts);
          setDelimiter(profile.delimiter);
          setSavedProfileLoaded(true);
        }
      } catch {
        // No profile found — first import for this account
      }
    }
  }, [accountsQuery.data, format, queryClient, trpc.import.getProfile]);

  /** Transition to the preview step with smart duplicate detection. */
  const handleGoToPreview = useCallback(async (txs: ParsedTransaction[], errs: { row: number; message: string }[]) => {
    setTransactions(txs);
    setErrors(errs);
    setCategoryOverrides({});
    setTagOverrides({});
    setDisplayNameOverrides({});
    setDuplicateIndices([]);
    setFuzzyDuplicates([]);
    setImportAnywayIndices(new Set());
    setDuplicateFlags([]);
    setImportContextData(null);
    setStep("preview");

    if (!accountId || txs.length === 0) return;

    // Get date range from imported transactions
    const dates = txs.map((t) => t.date.getTime());
    const importMinDate = new Date(Math.min(...dates));
    const importMaxDate = new Date(Math.max(...dates));

    // Fetch import context for smart duplicate detection
    try {
      const context = await queryClient.fetchQuery(
        trpc.import.getAccountImportContext.queryOptions({
          accountId,
          importMinDate,
          importMaxDate,
        })
      );

      // Build date comparison summary
      const importCountsByDate = new Map<string, number>();
      for (const tx of txs) {
        const key = tx.date.toISOString().slice(0, 10);
        importCountsByDate.set(key, (importCountsByDate.get(key) ?? 0) + 1);
      }

      const dbCountsByDate = new Map<string, number>();
      for (const g of context.existingCountsByDate) {
        const key = new Date(g.date).toISOString().slice(0, 10);
        dbCountsByDate.set(key, g._count);
      }

      const allDates = new Set([...importCountsByDate.keys(), ...dbCountsByDate.keys()]);
      const dateComparison = [...allDates].sort().map((date) => ({
        date,
        inFile: importCountsByDate.get(date) ?? 0,
        inDb: dbCountsByDate.get(date) ?? 0,
      }));

      const overlapDays = dateComparison.filter((d) => d.inFile > 0 && d.inDb > 0).length;

      // Gap detection
      const lastTxDate = context.lastTransactionDate ? new Date(context.lastTransactionDate) : null;
      let hasGap = false;
      let gapStart: string | null = null;
      let gapEnd: string | null = null;
      if (lastTxDate) {
        const dayAfterLast = new Date(lastTxDate);
        dayAfterLast.setDate(dayAfterLast.getDate() + 1);
        const dayDiff = Math.floor((importMinDate.getTime() - dayAfterLast.getTime()) / 86400000);
        if (dayDiff > 7) {
          hasGap = true;
          gapStart = dayAfterLast.toISOString().slice(0, 10);
          gapEnd = new Date(importMinDate.getTime() - 86400000).toISOString().slice(0, 10);
        }
      }

      setImportContextData({
        lastTransactionDate: context.lastTransactionDate ? new Date(context.lastTransactionDate).toISOString().slice(0, 10) : null,
        lastImportDate: context.lastImportDate ? new Date(context.lastImportDate).toISOString().slice(0, 10) : null,
        lastImportFileName: context.lastImportFileName,
        lastImportRowCount: context.lastImportRowCount,
        overlapDays,
        hasGap,
        gapStart,
        gapEnd,
        dateComparison,
      });

      // Fast deterministic duplicate flagging
      const existingByDate = new Map<string, { amount: number; description: string }[]>();
      for (const ex of context.existingInOverlap) {
        const key = new Date(ex.date).toISOString().slice(0, 10);
        if (!existingByDate.has(key)) existingByDate.set(key, []);
        existingByDate.get(key)!.push({ amount: ex.amount, description: ex.description });
      }

      const flags: DuplicateFlag[] = txs.map((tx) => {
        const txDate = tx.date.toISOString().slice(0, 10);
        const sameDateExisting = existingByDate.get(txDate) ?? [];

        // Check exact match: same date + same amount
        const amountMatch = sameDateExisting.find((ex) => ex.amount === tx.amount);
        if (amountMatch) {
          // Check description similarity
          const descA = tx.description.toLowerCase().slice(0, 20);
          const descB = amountMatch.description.toLowerCase().slice(0, 20);
          if (descA.includes(descB) || descB.includes(descA)) {
            return "duplicate"; // Same date + amount + similar description
          }
          return "sameAmount"; // Same date + amount but different description
        }

        // Check adjacent date (±1 day)
        const prevDate = new Date(tx.date.getTime() - 86400000).toISOString().slice(0, 10);
        const nextDate = new Date(tx.date.getTime() + 86400000).toISOString().slice(0, 10);
        const adjacentExisting = [
          ...(existingByDate.get(prevDate) ?? []),
          ...(existingByDate.get(nextDate) ?? []),
        ];
        if (adjacentExisting.some((ex) => ex.amount === tx.amount)) {
          return "similar";
        }

        return null;
      });

      setDuplicateFlags(flags);

      // Auto-mark definite duplicates
      const definiteDups = flags
        .map((f, i) => (f === "duplicate" ? i : -1))
        .filter((i) => i >= 0);
      setDuplicateIndices(definiteDups);

    } catch {
      // Fallback: use the old checkDuplicates mutation
      checkDuplicatesMutation.mutate({
        accountId,
        transactions: txs.map((tx) => ({
          date: tx.date,
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          externalId: tx.externalId,
        })),
      });
    }
  }, [accountId, queryClient, trpc.import.getAccountImportContext, checkDuplicatesMutation]);

  const handleCommit = () => {
    // Combined skip set: definite duplicates + AI/user-flagged fuzzy duplicates
    // that the user hasn't explicitly said "import anyway" on.
    const skipIndices = new Set([
      ...duplicateIndices,
      ...fuzzyDuplicates
        .filter((f) => (f.isDuplicate === true || f.isDuplicate === null) && !importAnywayIndices.has(f.index))
        .map((f) => f.index),
    ]);

    // Build the list with original indices preserved for display name lookup
    const txsToImport: { tx: ParsedTransaction; originalIdx: number }[] = [];
    transactions.forEach((tx, i) => {
      if (!skipIndices.has(i)) {
        txsToImport.push({ tx, originalIdx: i });
      }
    });

    commitMutation.mutate({
      accountId,
      fileName,
      format,
      transactions: txsToImport.map(({ tx, originalIdx }) => ({
        date: tx.date,
        description: tx.description,
        displayName: displayNameOverrides[originalIdx],
        amount: tx.amount,
        type: tx.type,
        visibility: defaultVisibility,
        categoryId: categoryOverrides[originalIdx] || undefined,
        tagIds: tagOverrides[originalIdx] ?? [],
        externalId: tx.externalId,
      })),
    }, {
      onSuccess: () => {
        // Auto-save the import profile for next time
        if (accountId && format === "CSV") {
          // Serialize column filters: store EXCLUDED values
          const serializedFilters: Record<string, string[]> = {};
          for (const fc of filterableColumns) {
            const selected = columnFilters[fc.column];
            if (selected && selected.size < fc.values.length) {
              const excluded = fc.values.filter((v) => !selected.has(v));
              if (excluded.length > 0) {
                serializedFilters[fc.column] = excluded;
              }
            }
          }

          saveProfileMutation.mutate({
            accountId,
            format,
            columnMapping: mapping as unknown as Record<string, string>,
            dateFormat: opheliaAnalysis?.dateFormat ?? "dd/MM/yyyy",
            delimiter,
            amountMode,
            invertAmounts,
            columnFilters: Object.keys(serializedFilters).length > 0 ? serializedFilters : undefined,
          });
        }

        queryClient.invalidateQueries();
        router.push("/transactions");
      },
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Import Transactions</h1>

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        {(["upload", "mapping", "filter", "preview", "confirm"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s
                  ? "bg-primary text-primary-foreground"
                  : i < ["upload", "mapping", "filter", "preview", "confirm"].indexOf(step)
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </div>
            {i < 4 && <div className="w-8 h-0.5 bg-muted" />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Bank File</CardTitle>
            <CardDescription>
              Upload your bank statement and Ophelia will analyse it for you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Bank File</Label>
              <div
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50"
                )}
              >
                <Upload className={cn("h-8 w-8 mx-auto mb-2", isDragging ? "text-primary" : "text-muted-foreground")} />
                <p className="text-sm text-muted-foreground mb-2">
                  {isDragging ? "Drop your file here" : "Drag and drop or click to upload"}
                </p>
                <p className="text-xs text-muted-foreground">
                  CSV, TSV, Excel (.xls/.xlsx), MT940 supported. Other formats? Let Ophelia try!
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </div>

            {fileName && (
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                <span>{fileName}</span>
                {!isUnknownFormat && <Badge variant="outline">{format}</Badge>}
                {isUnknownFormat && <Badge variant="outline" className="text-yellow-700 border-yellow-400">Unknown format</Badge>}
              </div>
            )}

            {/* Unknown format — Ophelia fallback flow */}
            {isUnknownFormat && fileContent && (
              <div className="space-y-3">
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950">
                  <div className="flex items-center gap-2 text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    <Sparkles className="h-4 w-4" />
                    Unrecognised file format
                  </div>
                  <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
                    This file isn&apos;t a standard CSV, MT940, or Excel format. Ophelia can try to extract
                    transactions automatically — results should be reviewed carefully.
                  </p>
                </div>
                {unknownFormatError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
                    <p className="text-sm text-red-800 dark:text-red-200">{unknownFormatError}</p>
                  </div>
                )}
                <Button
                  onClick={() => {
                    setUnknownFormatError(null);
                    extractUnknownMutation.mutate({ rawContent: fileContent, filename: fileName });
                  }}
                  disabled={extractUnknownMutation.isPending}
                  className="w-full"
                >
                  {extractUnknownMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Ophelia is analysing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Let Ophelia Try
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Normal flow */}
            {!isUnknownFormat && (
              <Button
                onClick={() => {
                  setStep("mapping");
                  if (format === "CSV" && !savedProfileLoaded) {
                    // First import — kick off Ophelia file analysis immediately
                    const sampleLines = fileContent
                      .split("\n")
                      .filter((l) => l.trim().length > 0)
                      .slice(0, 30)
                      .join("\n");
                    setOpheliaLoading(true);
                    setOpheliaAnalysis(null);
                    analyzeFileMutation.mutate({
                      rawContent: sampleLines,
                      filename: fileName,
                      delimiter,
                    });
                  }
                  // If savedProfileLoaded, skip Ophelia — mapping is already pre-filled
                }}
                disabled={!fileContent}
                className="w-full"
              >
                Next: {savedProfileLoaded ? "Review Mapping" : "Analyse File"}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Analyse & Map */}
      {step === "mapping" && (
        <Card>
          <CardHeader>
            <CardTitle>
              {format === "CSV" ? "Analyse & Map Columns" : "Configure Import"}
            </CardTitle>
            <CardDescription>
              {format === "CSV"
                ? `Select your account, review Ophelia's column mapping, and adjust if needed. ${csvRows.length} rows found.`
                : "Select the account and default visibility for this import."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Account selector */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Target Account</Label>
                <Select value={accountId} onChange={(e) => handleAccountChange(e.target.value)}>
                  <option value="">Select account…</option>
                  {(accountsQuery.data ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.institution ?? a.type})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Visibility</Label>
                <div className="flex items-center h-9 px-3 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">
                  {defaultVisibility === "SHARED" ? "Shared" : "Personal"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Determined by the account's ownership type.
                </p>
              </div>
            </div>

            {/* Ophelia analysis banner (CSV only) */}
            {format === "CSV" && opheliaLoading && (
              <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>Ophelia is analysing your file…</span>
              </div>
            )}
            {format === "CSV" && opheliaAnalysis && !opheliaLoading && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 shrink-0" />
                  <span className="font-medium">
                    {savedProfileLoaded
                      ? "Ophelia confirms your column mapping looks correct."
                      : "Ophelia pre-filled the mapping — review and adjust if needed."}
                  </span>
                </div>
                {opheliaAnalysis.additionalNotes && (
                  <p className="mt-1 pl-6 text-xs opacity-80">{opheliaAnalysis.additionalNotes}</p>
                )}
              </div>
            )}
            {/* Saved profile banner + re-analyse button */}
            {format === "CSV" && savedProfileLoaded && !opheliaLoading && !opheliaAnalysis && (
              <div className="flex items-center justify-between rounded-lg border border-muted p-3">
                <div className="text-sm text-muted-foreground">
                  Settings restored from your last import for this account.
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const sampleLines = fileContent
                      .split("\n")
                      .filter((l) => l.trim().length > 0)
                      .slice(0, 30)
                      .join("\n");
                    setOpheliaLoading(true);
                    analyzeFileMutation.mutate({
                      rawContent: sampleLines,
                      filename: fileName,
                      delimiter,
                    });
                  }}
                  disabled={opheliaLoading}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Re-analyse with Ophelia
                </Button>
              </div>
            )}

            {/* CSV-only: column mapping dropdowns + preview */}
            {format === "CSV" && (
              <>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      Date Column
                      <ConfidenceDot confidence={opheliaConf("date")} />
                    </Label>
                    <Select
                      value={mapping.date}
                      onChange={(e) => setMapping({ ...mapping, date: e.target.value })}
                    >
                      <option value="">Select column...</option>
                      {csvHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      Description Column
                      <ConfidenceDot confidence={opheliaConf("description")} />
                    </Label>
                    <Select
                      value={mapping.description}
                      onChange={(e) => setMapping({ ...mapping, description: e.target.value })}
                    >
                      <option value="">Select column...</option>
                      {csvHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      Amount Layout
                      {opheliaAnalysis && !opheliaLoading && (
                        <ConfidenceDot
                          confidence={
                            amountMode === "SPLIT"
                              ? opheliaConf("debit") ?? opheliaConf("credit")
                              : opheliaConf("amount")
                          }
                        />
                      )}
                    </Label>
                    <Select
                      value={amountMode}
                      onChange={(e) => {
                        const mode = e.target.value as "SINGLE" | "SPLIT";
                        setAmountMode(mode);
                        if (mode === "SINGLE") {
                          setMapping({ ...mapping, debit: undefined, credit: undefined });
                        } else {
                          setMapping({ ...mapping, amount: "" });
                        }
                      }}
                    >
                      <option value="SINGLE">Single amount column</option>
                      <option value="SPLIT">Separate debit / credit columns</option>
                    </Select>
                  </div>

                  {amountMode === "SINGLE" ? (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        Amount Column
                        <ConfidenceDot confidence={opheliaConf("amount")} />
                      </Label>
                      <Select
                        value={mapping.amount}
                        onChange={(e) => setMapping({ ...mapping, amount: e.target.value })}
                      >
                        <option value="">Select column...</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </Select>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={invertAmounts}
                          onChange={(e) => setInvertAmounts(e.target.checked)}
                          className="h-4 w-4 rounded border-border"
                        />
                        <span className="text-sm">Invert amount signs</span>
                        <span className="text-xs text-muted-foreground">
                          (for credit card exports where expenses appear as positive numbers)
                        </span>
                      </label>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5">
                          Credit / Incoming Column
                          <ConfidenceDot confidence={opheliaConf("credit")} />
                        </Label>
                        <Select
                          value={mapping.credit ?? ""}
                          onChange={(e) => setMapping({ ...mapping, credit: e.target.value || undefined })}
                        >
                          <option value="">Select column...</option>
                          {csvHeaders.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5">
                          Debit / Outgoing Column
                          <ConfidenceDot confidence={opheliaConf("debit")} />
                        </Label>
                        <Select
                          value={mapping.debit ?? ""}
                          onChange={(e) => setMapping({ ...mapping, debit: e.target.value || undefined })}
                        >
                          <option value="">Select column...</option>
                          {csvHeaders.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Preview first 3 rows */}
                {csvRows.length > 0 && (
                  <div className="text-xs overflow-x-auto">
                    <table className="w-full border">
                      <thead>
                        <tr>
                          {csvHeaders.slice(0, 6).map((h) => (
                            <th key={h} className="p-2 border text-left bg-muted">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(0, 3).map((row, i) => (
                          <tr key={i}>
                            {csvHeaders.slice(0, 6).map((h) => (
                              <td key={h} className="p-2 border">{row[h]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("upload");
                  setOpheliaAnalysis(null);
                  setOpheliaLoading(false);
                }}
                className="flex-1"
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                onClick={() => {
                  if (format === "CSV") {
                    handleGoToFilter();
                  } else {
                    // MT940: parse now and go to preview
                    const result = parseMT940(fileContent);
                    handleGoToPreview(
                      result.transactions,
                      result.errors.map((msg, i) => ({ row: i, message: msg }))
                    );
                  }
                }}
                disabled={
                  !accountId ||
                  (format === "CSV" &&
                    (!mapping.date ||
                      !mapping.description ||
                      (amountMode === "SINGLE" ? !mapping.amount : !mapping.debit || !mapping.credit)))
                }
                className="flex-1"
              >
                {format === "CSV" ? "Next: Filter Rows" : "Next: Preview"}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Filter Rows (CSV only) */}
      {step === "filter" && format === "CSV" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filter Rows
            </CardTitle>
            <CardDescription>
              {filteredCsvRows.length} of {csvRows.length} rows will be imported.
              Uncheck values you want to exclude.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {savedProfileLoaded && (
              <div className="rounded-lg border border-muted p-2.5 text-xs text-muted-foreground">
                Filter settings restored from last import. Adjust if needed.
              </div>
            )}
            <div className="flex gap-4 items-start">
              {/* Left: filter accordion panels */}
              <div className="w-56 flex-shrink-0">
                {filterableColumns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No filterable columns found (all columns have too many unique values).
                  </p>
                ) : (
                  <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                    {filterableColumns.map(({ column, values, valueCounts }) => {
                      const isCollapsed = collapsedFilterColumns.has(column);
                      const selectedSet = columnFilters[column] ?? new Set(values);
                      const allSelected = selectedSet.size === values.length;
                      const noneSelected = selectedSet.size === 0;

                      return (
                        <div key={column} className="border rounded-lg">
                          <button
                            type="button"
                            onClick={() => {
                              setCollapsedFilterColumns((prev) => {
                                const next = new Set(prev);
                                if (next.has(column)) next.delete(column);
                                else next.add(column);
                                return next;
                              });
                            }}
                            className="w-full flex items-center justify-between p-3 hover:bg-muted/50 rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              <ChevronRight
                                className={cn(
                                  "h-4 w-4 text-muted-foreground transition-transform",
                                  !isCollapsed && "rotate-90"
                                )}
                              />
                              <span className="font-medium text-sm">{column}</span>
                            </div>
                            <Badge
                              variant={allSelected ? "outline" : "default"}
                              className="text-xs"
                            >
                              {selectedSet.size}/{values.length}
                            </Badge>
                          </button>

                          {!isCollapsed && (
                            <div className="px-3 pb-3 space-y-1">
                              <div className="flex gap-2 mb-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setColumnFilters((prev) => ({
                                      ...prev,
                                      [column]: new Set(values),
                                    }));
                                  }}
                                  className={cn(
                                    "text-xs hover:underline",
                                    allSelected ? "text-muted-foreground" : "text-primary"
                                  )}
                                  disabled={allSelected}
                                >
                                  Select all
                                </button>
                                <span className="text-xs text-muted-foreground">|</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setColumnFilters((prev) => ({
                                      ...prev,
                                      [column]: new Set<string>(),
                                    }));
                                  }}
                                  className={cn(
                                    "text-xs hover:underline",
                                    noneSelected ? "text-muted-foreground" : "text-primary"
                                  )}
                                  disabled={noneSelected}
                                >
                                  Deselect all
                                </button>
                              </div>

                              {values.map((value) => (
                                <label
                                  key={value}
                                  className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-muted/30 rounded px-1"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedSet.has(value)}
                                    onChange={() => {
                                      setColumnFilters((prev) => {
                                        const current = new Set(prev[column] ?? values);
                                        if (current.has(value)) {
                                          current.delete(value);
                                        } else {
                                          current.add(value);
                                        }
                                        return { ...prev, [column]: current };
                                      });
                                    }}
                                    className="rounded border-input"
                                  />
                                  <span className="text-sm flex-1">
                                    {value === "" ? (
                                      <span className="italic text-muted-foreground">(empty)</span>
                                    ) : (
                                      value
                                    )}
                                  </span>
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    {valueCounts[value] ?? 0}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right: sample data table */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-2">
                  Showing {Math.min(10, filteredCsvRows.length)} of {filteredCsvRows.length} rows
                  {filteredCsvRows.length !== csvRows.length && (
                    <span className="text-primary font-medium">
                      {" "}({csvRows.length - filteredCsvRows.length} excluded)
                    </span>
                  )}
                </p>
                <div className="overflow-auto max-h-[460px] rounded-md border">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="bg-muted/50">
                        {csvHeaders.map((header) => {
                          const fc = filterableByColumn.get(header);
                          const sel = columnFilters[header];
                          const isFiltered = fc !== undefined && sel !== undefined && sel.size < fc.values.length;
                          return (
                            <th
                              key={header}
                              className="px-3 py-2 text-left font-medium whitespace-nowrap border-b sticky top-0 bg-muted/50"
                            >
                              <button
                                type="button"
                                className="flex items-center gap-1 group"
                                title={isFiltered ? `Filtering ${header} — click to expand` : header}
                                onClick={isFiltered ? () => {
                                  setCollapsedFilterColumns((prev) => {
                                    const next = new Set(prev);
                                    next.delete(header);
                                    return next;
                                  });
                                } : undefined}
                              >
                                <span>{header}</span>
                                {isFiltered && (
                                  <Filter className="h-3 w-3 text-primary flex-shrink-0" />
                                )}
                              </button>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCsvRows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                          {csvHeaders.map((header) => {
                            const value = row[header]?.trim() ?? "";
                            return (
                              <td
                                key={header}
                                className="px-3 py-1.5 whitespace-nowrap max-w-[180px] truncate"
                                title={value}
                              >
                                {value || (
                                  <span className="italic text-muted-foreground">(empty)</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {filteredCsvRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={csvHeaders.length}
                            className="px-3 py-6 text-center text-muted-foreground"
                          >
                            No rows match the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("mapping")} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                onClick={() => {
                  const amountHints: AmountColumnHints = {
                    ...(opheliaAnalysis
                      ? {
                          debitSignConvention: opheliaAnalysis.detectedFields.find(
                            (f) => f.mappedTo === "debit"
                          )?.signConvention,
                          creditSignConvention: opheliaAnalysis.detectedFields.find(
                            (f) => f.mappedTo === "credit"
                          )?.signConvention,
                        }
                      : {}),
                    invertAmounts,
                  };
                  const result = transformCsvToTransactions(
                    filteredCsvRows,
                    mapping,
                    opheliaAnalysis?.dateFormat,
                    amountHints
                  );
                  handleGoToPreview(result.transactions, result.errors);
                }}
                disabled={filteredCsvRows.length === 0}
                className="flex-1"
              >
                Parse & Preview ({filteredCsvRows.length} rows)
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Preview */}
      {step === "preview" && (
        <Card>
          <CardHeader>
            <CardTitle>Preview Transactions</CardTitle>
            <CardDescription className="flex items-center gap-2">
              <span>
                {transactions.length} transactions parsed
                {errors.length > 0 && `, ${errors.length} errors`}
              </span>
              {checkDuplicatesMutation.isPending && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking for duplicates…
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {opheliaFallbackWarning && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950">
                <div className="flex items-center gap-2 text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  <Sparkles className="h-4 w-4" />
                  Ophelia extracted these transactions — please review carefully
                </div>
                <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
                  {opheliaFallbackWarning}
                </p>
              </div>
            )}
            {errors.length > 0 && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950">
                <div className="flex items-center gap-2 text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  <AlertTriangle className="h-4 w-4" />
                  {errors.length} row(s) had errors and will be skipped
                </div>
                <ul className="mt-2 text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                  {errors.slice(0, 5).map((err, i) => (
                    <li key={i}>Row {err.row}: {err.message}</li>
                  ))}
                  {errors.length > 5 && <li>...and {errors.length - 5} more</li>}
                </ul>
              </div>
            )}

            {/* Import context — date range analysis */}
            {importContextData && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950 space-y-2">
                {importContextData.lastImportFileName && (
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Last import: &ldquo;{importContextData.lastImportFileName}&rdquo; on {importContextData.lastImportDate} ({importContextData.lastImportRowCount} transactions)
                  </p>
                )}
                {importContextData.lastTransactionDate && (
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Latest transaction date in this account: {importContextData.lastTransactionDate}
                  </p>
                )}
                {transactions.length > 0 && (
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    This file covers: {transactions[0].date.toISOString().slice(0, 10)} &ndash; {transactions[transactions.length - 1].date.toISOString().slice(0, 10)}
                  </p>
                )}
                {importContextData.overlapDays > 0 ? (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    {importContextData.overlapDays} day(s) overlap with existing data — check for duplicates below
                  </p>
                ) : importContextData.lastTransactionDate ? (
                  <p className="text-xs font-medium text-green-700 dark:text-green-300">
                    <Check className="h-3 w-3 inline mr-1" />
                    No overlap with existing data — looking good!
                  </p>
                ) : null}
                {importContextData.hasGap && importContextData.gapStart && importContextData.gapEnd && (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    Gap detected: no data between {importContextData.gapStart} and {importContextData.gapEnd}. Did you miss a file?
                  </p>
                )}
              </div>
            )}

            {/* Quick actions for duplicate handling */}
            {duplicateFlags.some((f) => f !== null) && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const dups = duplicateFlags
                      .map((f, i) => (f === "duplicate" ? i : -1))
                      .filter((i) => i >= 0);
                    setDuplicateIndices(dups);
                    setImportAnywayIndices(new Set());
                  }}
                >
                  Skip all likely duplicates ({duplicateFlags.filter((f) => f === "duplicate").length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Skip all transactions on dates that are fully covered in DB
                    const skipDates = new Set(
                      (importContextData?.dateComparison ?? [])
                        .filter((d) => d.inDb > 0 && d.inDb >= d.inFile)
                        .map((d) => d.date)
                    );
                    const dups = transactions
                      .map((tx, i) => skipDates.has(tx.date.toISOString().slice(0, 10)) ? i : -1)
                      .filter((i) => i >= 0);
                    setDuplicateIndices(dups);
                    setImportAnywayIndices(new Set());
                  }}
                >
                  Import only new dates
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDuplicateIndices([]);
                    setFuzzyDuplicates([]);
                    const allIndices = new Set(transactions.map((_, i) => i));
                    setImportAnywayIndices(allIndices);
                  }}
                >
                  Import all
                </Button>
              </div>
            )}

            <div className="max-h-[560px] overflow-y-auto space-y-1">
              {transactions.slice(0, 50).map((tx, i) => {
                const extracted = displayNameOverrides[i] ?? extractDisplayName(tx.description);
                const showOriginal = extracted !== tx.description;
                const effectiveCategoryId = categoryOverrides[i] ?? "";
                const effectiveTags = tagOverrides[i] ?? [];

                const isDefiniteDup = duplicateIndices.includes(i);
                const fastFlag = duplicateFlags[i] ?? null;
                const fuzzy = fuzzyDuplicates.find((f) => f.index === i);
                const isHighConfAIDup = fuzzy?.isDuplicate === true && (fuzzy.confidence ?? 0) > 0.85;
                const isLowConfAIDup = fuzzy?.isDuplicate === true && (fuzzy.confidence ?? 0) <= 0.85;
                const isUndecidedFuzzy = fuzzy?.isDuplicate === null;
                const isSkipped =
                  isDefiniteDup ||
                  ((isHighConfAIDup || isLowConfAIDup || isUndecidedFuzzy) &&
                    !importAnywayIndices.has(i));

                return (
                  <div
                    key={i}
                    className={`py-2 px-2 rounded ${
                      isDefiniteDup || isHighConfAIDup
                        ? "bg-muted/40 opacity-60"
                        : isLowConfAIDup || isUndecidedFuzzy || fastFlag === "sameAmount"
                        ? "bg-yellow-50 dark:bg-yellow-950/50"
                        : "hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {/* Display name row */}
                        <div className="flex items-center gap-1.5">
                          {editingDisplayNameIdx === i ? (
                            <input
                              type="text"
                              className="text-sm font-medium w-full border rounded px-1.5 py-0.5 bg-background"
                              defaultValue={extracted}
                              autoFocus
                              maxLength={100}
                              onBlur={(e) => {
                                const val = e.target.value.trim();
                                if (val && val !== extractDisplayName(tx.description)) {
                                  setDisplayNameOverrides((prev) => ({ ...prev, [i]: val }));
                                } else {
                                  setDisplayNameOverrides((prev) => {
                                    const next = { ...prev };
                                    delete next[i];
                                    return next;
                                  });
                                }
                                setEditingDisplayNameIdx(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") setEditingDisplayNameIdx(null);
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              className="text-sm font-medium truncate block text-left w-full group flex items-center gap-1"
                              onClick={() => setEditingDisplayNameIdx(i)}
                              title="Click to edit display name"
                            >
                              <span className="truncate">{extracted}</span>
                              <Pencil className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 shrink-0" />
                            </button>
                          )}
                        </div>

                        {/* Original description */}
                        {showOriginal && (
                          <p
                            className="text-xs text-muted-foreground/50 truncate pl-3.5"
                            title={tx.description}
                          >
                            {tx.description.length > 60
                              ? tx.description.slice(0, 60) + "..."
                              : tx.description}
                          </p>
                        )}

                        {/* Date + category row */}
                        <div className="flex items-center gap-2 mt-0.5 pl-3.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">{formatDate(tx.date)}</span>
                          <select
                            className="text-xs border rounded px-1.5 py-0.5 bg-background text-foreground max-w-[180px]"
                            value={effectiveCategoryId}
                            onChange={(e) =>
                              setCategoryOverrides((prev) => ({ ...prev, [i]: e.target.value }))
                            }
                          >
                            <option value="">Uncategorised</option>
                            {(categoriesQuery.data ?? [])
                              .filter((c) => c.visibility === defaultVisibility)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.parent?.name ? `${c.parent.name} / ${c.name}` : c.name}
                                </option>
                              ))}
                          </select>
                        </div>

                        {/* Tag chips */}
                        {effectiveTags.length > 0 && (
                          <div className="flex items-center gap-1 mt-1 pl-3.5 flex-wrap">
                            <TagIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                            {effectiveTags.map((tagId) => {
                              const tag = (tagsQuery.data ?? []).find((t) => t.id === tagId);
                              if (!tag) return null;
                              return (
                                <button
                                  key={tagId}
                                  type="button"
                                  onClick={() =>
                                    setTagOverrides((prev) => ({
                                      ...prev,
                                      [i]: (prev[i] ?? []).filter((id) => id !== tagId),
                                    }))
                                  }
                                  className="inline-flex items-center gap-0.5 text-xs bg-muted hover:bg-destructive/10 hover:text-destructive px-1.5 py-0.5 rounded-full transition-colors"
                                  title="Click to remove tag"
                                >
                                  {tag.name}
                                  <span className="opacity-50">×</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <MoneyDisplay amount={tx.amount} className="text-sm font-medium" />
                        {isDefiniteDup && (
                          <Badge variant="secondary" className="text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">Duplicate</Badge>
                        )}
                        {!isDefiniteDup && fastFlag === "sameAmount" && (
                          <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 dark:text-amber-400">Same amount</Badge>
                        )}
                        {!isDefiniteDup && fastFlag === "similar" && (
                          <Badge variant="outline" className="text-xs border-yellow-200 text-yellow-600 dark:text-yellow-400">Similar</Badge>
                        )}
                        {(isHighConfAIDup || isLowConfAIDup || isUndecidedFuzzy) && (
                          <div className="flex flex-col items-end gap-0.5">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                isHighConfAIDup
                                  ? "border-orange-300 text-orange-700 dark:text-orange-400"
                                  : "border-yellow-300 text-yellow-700 dark:text-yellow-400"
                              }`}
                            >
                              <Sparkles className="h-2.5 w-2.5 mr-1" />
                              {isUndecidedFuzzy ? "Potential duplicate?" : "AI: possible duplicate"}
                            </Badge>
                            {fuzzy?.reasoning && (
                              <p className="text-[10px] text-muted-foreground text-right max-w-[160px] leading-tight">
                                {fuzzy.reasoning}
                              </p>
                            )}
                            {fuzzy?.matchedDescription && !isUndecidedFuzzy && (
                              <p className="text-[10px] text-muted-foreground text-right max-w-[160px] leading-tight">
                                of &ldquo;{fuzzy.matchedDescription}&rdquo;
                              </p>
                            )}
                            {isSkipped ? (
                              <button
                                type="button"
                                className="text-[10px] text-blue-600 dark:text-blue-400 underline underline-offset-1"
                                onClick={() =>
                                  setImportAnywayIndices((prev) => {
                                    const next = new Set(prev);
                                    next.add(i);
                                    return next;
                                  })
                                }
                              >
                                Import anyway
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="text-[10px] text-muted-foreground underline underline-offset-1"
                                onClick={() =>
                                  setImportAnywayIndices((prev) => {
                                    const next = new Set(prev);
                                    next.delete(i);
                                    return next;
                                  })
                                }
                              >
                                Skip it
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {transactions.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  ...and {transactions.length - 50} more
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(format === "CSV" ? "filter" : "upload")} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={handleCommit} disabled={transactions.length === 0 || commitMutation.isPending} className="flex-1">
                <Check className="h-4 w-4 mr-1" />
                {commitMutation.isPending ? (
                  "Importing..."
                ) : (() => {
                  const skipCount =
                    duplicateIndices.length +
                    fuzzyDuplicates.filter(
                      (f) =>
                        (f.isDuplicate === true || f.isDuplicate === null) &&
                        !importAnywayIndices.has(f.index)
                    ).length;
                  return `Import ${transactions.length - skipCount} Transaction${transactions.length - skipCount !== 1 ? "s" : ""}`;
                })()}
              </Button>
            </div>

            {commitMutation.error && (
              <p className="text-sm text-red-600">{commitMutation.error.message}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
