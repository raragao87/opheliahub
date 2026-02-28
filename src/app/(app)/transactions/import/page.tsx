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
import { parseCsvFile, transformCsvToTransactions, type ColumnMapping, type ParsedTransaction } from "@/lib/parsers/csv-parser";
import { parseMT940 } from "@/lib/parsers/mt940-parser";
import { Upload, FileText, ArrowRight, ArrowLeft, Check, AlertTriangle, ChevronRight, Filter, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { extractDisplayName } from "@/lib/recurring";

type Step = "upload" | "mapping" | "filter" | "preview" | "confirm";

export default function ImportPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const accountsQuery = useQuery(trpc.account.list.queryOptions());

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

  // Filter step state
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [collapsedFilterColumns, setCollapsedFilterColumns] = useState<Set<string>>(new Set());

  // Parsed transactions
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [errors, setErrors] = useState<{ row: number; message: string }[]>([]);
  const [duplicateIndices, setDuplicateIndices] = useState<number[]>([]);

  // Display name overrides (index → custom name)
  const [displayNameOverrides, setDisplayNameOverrides] = useState<Record<number, string>>({});
  const [editingDisplayNameIdx, setEditingDisplayNameIdx] = useState<number | null>(null);

  const commitMutation = useMutation(
    trpc.import.commit.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries();
        router.push("/transactions");
      },
    })
  );

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setFileContent(content);

      // Auto-detect format
      if (file.name.endsWith(".mt940") || file.name.endsWith(".sta") || file.name.endsWith(".940")) {
        setFormat("MT940");
      } else {
        setFormat("CSV");
      }

      // For CSV, parse headers immediately
      if (!file.name.endsWith(".mt940") && !file.name.endsWith(".sta") && !file.name.endsWith(".940")) {
        const result = parseCsvFile(content);
        setCsvHeaders(result.headers);
        setCsvRows(result.rows);
      }
    };
    reader.readAsText(file);
  }, []);

  // Derive filterable columns (low cardinality only)
  const filterableColumns = useMemo(() => {
    const MAX_CARDINALITY = 50;
    const result: { column: string; values: string[] }[] = [];
    for (const header of csvHeaders) {
      const uniqueValues = new Set<string>();
      for (const row of csvRows) {
        const val = row[header]?.trim() ?? "";
        uniqueValues.add(val);
        if (uniqueValues.size > MAX_CARDINALITY) break;
      }
      if (uniqueValues.size > 0 && uniqueValues.size <= MAX_CARDINALITY) {
        const sorted = Array.from(uniqueValues).sort((a, b) => {
          if (a === "") return 1;
          if (b === "") return -1;
          return a.localeCompare(b);
        });
        result.push({ column: header, values: sorted });
      }
    }
    return result;
  }, [csvHeaders, csvRows]);

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

  const handleCommit = () => {
    // Build the list with original indices preserved for display name lookup
    const txsToImport: { tx: ParsedTransaction; originalIdx: number }[] = [];
    transactions.forEach((tx, i) => {
      if (!duplicateIndices.includes(i)) {
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
            <CardDescription>Select an account and upload your bank statement file.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Target Account</Label>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Select account...</option>
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
            </div>

            <div className="space-y-2">
              <Label>Bank File</Label>
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-2">
                  Drag and drop or click to upload
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  CSV, MT940, STA formats supported
                </p>
                <Input
                  type="file"
                  accept=".csv,.mt940,.sta,.940,.txt"
                  onChange={handleFileUpload}
                  className="max-w-xs mx-auto"
                />
              </div>
            </div>

            {fileName && (
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                <span>{fileName}</span>
                <Badge variant="outline">{format}</Badge>
              </div>
            )}

            <Button
              onClick={() => {
                if (format === "CSV") {
                  setStep("mapping");
                } else {
                  // MT940: parse immediately and go to preview
                  const result = parseMT940(fileContent);
                  setTransactions(result.transactions);
                  setErrors(result.errors.map((msg, i) => ({ row: i, message: msg })));
                  setStep("preview");
                }
              }}
              disabled={!accountId || !fileContent}
              className="w-full"
            >
              {format === "CSV" ? "Next: Map Columns" : "Next: Preview"}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Column Mapping (CSV only) */}
      {step === "mapping" && format === "CSV" && (
        <Card>
          <CardHeader>
            <CardTitle>Map Columns</CardTitle>
            <CardDescription>
              Map your CSV columns to transaction fields. Preview: {csvRows.length} rows found.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Date Column</Label>
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
                <Label>Description Column</Label>
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
                <Label>Amount Layout</Label>
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
                  <Label>Amount Column</Label>
                  <Select
                    value={mapping.amount}
                    onChange={(e) => setMapping({ ...mapping, amount: e.target.value })}
                  >
                    <option value="">Select column...</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </Select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Credit / Incoming Column</Label>
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
                    <Label>Debit / Outgoing Column</Label>
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

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("upload")} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                onClick={handleGoToFilter}
                disabled={
                  !mapping.date ||
                  !mapping.description ||
                  (amountMode === "single" ? !mapping.amount : !mapping.debit || !mapping.credit)
                }
                className="flex-1"
              >
                Next: Filter Rows <ArrowRight className="h-4 w-4 ml-1" />
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
            {filterableColumns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No filterable columns found (all columns have too many unique values).
              </p>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {filterableColumns.map(({ column, values }) => {
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
                              <span className="text-sm">
                                {value === "" ? (
                                  <span className="italic text-muted-foreground">(empty)</span>
                                ) : (
                                  value
                                )}
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

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("mapping")} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                onClick={() => {
                  const result = transformCsvToTransactions(filteredCsvRows, mapping);
                  setTransactions(result.transactions);
                  setErrors(result.errors);
                  setStep("preview");
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
            <CardDescription>
              {transactions.length} transactions parsed
              {errors.length > 0 && `, ${errors.length} errors`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <div className="max-h-96 overflow-y-auto space-y-1">
              {transactions.slice(0, 50).map((tx, i) => {
                const extracted = displayNameOverrides[i] ?? extractDisplayName(tx.description);
                const showOriginal = extracted !== tx.description;

                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between py-2 px-2 rounded ${
                      duplicateIndices.includes(i)
                        ? "bg-yellow-50 dark:bg-yellow-950 opacity-60"
                        : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1 mr-3">
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
                      {showOriginal && (
                        <p
                          className="text-xs text-muted-foreground/50 truncate"
                          title={tx.description}
                        >
                          {tx.description.length > 60
                            ? tx.description.slice(0, 60) + "..."
                            : tx.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <MoneyDisplay amount={tx.amount} className="text-sm font-medium" />
                      {duplicateIndices.includes(i) && (
                        <Badge variant="secondary" className="text-xs">Duplicate</Badge>
                      )}
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
                {commitMutation.isPending
                  ? "Importing..."
                  : `Import ${transactions.length - duplicateIndices.length} Transactions`}
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
