"use client";

import { useState, useCallback, useMemo } from "react";
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
  const [amountMode, setAmountMode] = useState<"single" | "split">("single");
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

  const commitMutation = useMutation(
    trpc.import.commit.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        router.push("/transactions");
      },
    })
  );

  const checkDuplicatesMutation = useMutation(
    trpc.import.checkDuplicates.mutationOptions({
      onSuccess: (data) => {
        setDuplicateIndices(data.duplicates);
        setFuzzyDuplicates(data.fuzzy ?? []);
      },
    })
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
          setAmountMode("split");
          setMapping({
            date: dateF ? String(dateF.sourceColumn) : "",
            description: descF ? String(descF.sourceColumn) : "",
            amount: "",
            debit: String(debitF.sourceColumn),
            credit: String(creditF.sourceColumn),
          });
        } else {
          setAmountMode("single");
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

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

  const handleGoToFilter = () => {
    const initialFilters: Record<string, Set<string>> = {};
    for (const { column, values } of filterableColumns) {
      initialFilters[column] = new Set(values);
    }
    setColumnFilters(initialFilters);
    setCollapsedFilterColumns(new Set());
    setStep("filter");
  };

  /** When the user picks an account, auto-set visibility and amount inversion from the account type. */
  const handleAccountChange = (newAccountId: string) => {
    setAccountId(newAccountId);
    const account = (accountsQuery.data ?? []).find((a) => a.id === newAccountId);
    if (account) {
      setDefaultVisibility(account.ownership as "SHARED" | "PERSONAL");
      const meta = ACCOUNT_TYPE_META[account.type];
      setInvertAmounts(meta?.isLiability ?? false);
    }
  };

  /** Transition to the preview step. */
  const handleGoToPreview = (txs: ParsedTransaction[], errs: { row: number; message: string }[]) => {
    setTransactions(txs);
    setErrors(errs);
    setCategoryOverrides({});
    setTagOverrides({});
    setDisplayNameOverrides({});
    setDuplicateIndices([]);
    setFuzzyDuplicates([]);
    setImportAnywayIndices(new Set());
    // Note: opheliaFallbackWarning is intentionally NOT reset here —
    // extractUnknownMutation sets it before calling handleGoToPreview.
    setStep("preview");

    // Kick off duplicate check in the background — badges appear once it resolves
    if (accountId && txs.length > 0) {
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
  };

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
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-2">
                  Drag and drop or click to upload
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  CSV, TSV, Excel (.xls/.xlsx), MT940 supported. Other formats? Let Ophelia try!
                </p>
                <Input
                  type="file"
                  accept="*"
                  onChange={handleFileUpload}
                  className="max-w-xs mx-auto"
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
                  if (format === "CSV") {
                    // Kick off Ophelia file analysis immediately
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
                }}
                disabled={!fileContent}
                className="w-full"
              >
                Next: Analyse File
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
                <Label>Default Visibility</Label>
                <Select
                  value={defaultVisibility}
                  onChange={(e) => setDefaultVisibility(e.target.value as "SHARED" | "PERSONAL")}
                >
                  <option value="SHARED">Shared</option>
                  <option value="PERSONAL">Personal</option>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Auto-set from the account's ownership type.
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
                  <span className="font-medium">Ophelia pre-filled the mapping — review and adjust if needed.</span>
                </div>
                {opheliaAnalysis.additionalNotes && (
                  <p className="mt-1 pl-6 text-xs opacity-80">{opheliaAnalysis.additionalNotes}</p>
                )}
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
                            amountMode === "split"
                              ? opheliaConf("debit") ?? opheliaConf("credit")
                              : opheliaConf("amount")
                          }
                        />
                      )}
                    </Label>
                    <Select
                      value={amountMode}
                      onChange={(e) => {
                        const mode = e.target.value as "single" | "split";
                        setAmountMode(mode);
                        if (mode === "single") {
                          setMapping({ ...mapping, debit: undefined, credit: undefined });
                        } else {
                          setMapping({ ...mapping, amount: "" });
                        }
                      }}
                    >
                      <option value="single">Single amount column</option>
                      <option value="split">Separate debit / credit columns</option>
                    </Select>
                  </div>

                  {amountMode === "single" ? (
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
                      (amountMode === "single" ? !mapping.amount : !mapping.debit || !mapping.credit)))
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

            <div className="max-h-[560px] overflow-y-auto space-y-1">
              {transactions.slice(0, 50).map((tx, i) => {
                const extracted = displayNameOverrides[i] ?? extractDisplayName(tx.description);
                const showOriginal = extracted !== tx.description;
                const effectiveCategoryId = categoryOverrides[i] ?? "";
                const effectiveTags = tagOverrides[i] ?? [];

                const isDefiniteDup = duplicateIndices.includes(i);
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
                        : isLowConfAIDup || isUndecidedFuzzy
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
                          <Badge variant="secondary" className="text-xs">Duplicate</Badge>
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
