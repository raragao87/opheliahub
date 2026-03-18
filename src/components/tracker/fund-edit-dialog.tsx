"use client";

import { useState, useEffect } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogHeader, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyDisplay } from "@/components/shared/money-display";
import { fromCents, toCents } from "@/lib/money";
import { t, type Language } from "@/lib/translations";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Save, Trash2, Plus } from "lucide-react";

interface FundEditDialogProps {
  fundId: string | null; // null = create mode
  open: boolean;
  onClose: () => void;
  visibility: "SHARED" | "PERSONAL";
  lang: Language;
}

export function FundEditDialog({ fundId, open, onClose, visibility, lang }: FundEditDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isCreate = fundId === null;

  // Fetch fund data when editing
  const fundQuery = useQuery({
    ...trpc.fund.getWithEntries.queryOptions({ fundId: fundId! }),
    enabled: !!fundId && open,
  });

  // Fetch accounts for linking
  const accountsQuery = useQuery(
    trpc.account.list.queryOptions()
  );

  const fund = fundQuery.data;
  const accounts = accountsQuery.data ?? [];

  // Form state
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [monthlyContribution, setMonthlyContribution] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [linkedAccountId, setLinkedAccountId] = useState("");

  // Add entry state
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [entryType, setEntryType] = useState<"CONTRIBUTION" | "WITHDRAWAL" | "ADJUSTMENT">("CONTRIBUTION");
  const [entryAmount, setEntryAmount] = useState("");
  const [entryNote, setEntryNote] = useState("");

  // Initialize form when fund loads
  useEffect(() => {
    if (fund && open) {
      setName(fund.name);
      setIcon(fund.icon ?? "");
      setMonthlyContribution(fromCents(fund.monthlyContribution).toString());
      setTargetAmount(fund.targetAmount ? fromCents(fund.targetAmount).toString() : "");
      setTargetDate(fund.targetDate ? new Date(fund.targetDate).toISOString().split("T")[0] : "");
      setLinkedAccountId(fund.linkedAccountId ?? "");
    }
  }, [fund, open]);

  // Reset form for create mode
  useEffect(() => {
    if (isCreate && open) {
      setName("");
      setIcon("");
      setMonthlyContribution("");
      setTargetAmount("");
      setTargetDate("");
      setLinkedAccountId("");
    }
  }, [isCreate, open]);

  const createMutation = useMutation(
    trpc.fund.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast.success("Fund created");
        onClose();
      },
    })
  );

  const updateMutation = useMutation(
    trpc.fund.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast.success("Fund updated");
        onClose();
      },
    })
  );

  const deleteMutation = useMutation(
    trpc.fund.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast.success("Fund deleted");
        onClose();
      },
    })
  );

  const addEntryMutation = useMutation(
    trpc.fund.addEntry.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast.success("Entry added");
        setShowAddEntry(false);
        setEntryAmount("");
        setEntryNote("");
      },
    })
  );

  const deleteEntryMutation = useMutation(
    trpc.fund.deleteEntry.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
      },
    })
  );

  const handleSave = () => {
    if (isCreate) {
      createMutation.mutate({
        name: name.trim(),
        icon: icon.trim() || undefined,
        monthlyContribution: toCents(parseFloat(monthlyContribution) || 0),
        targetAmount: targetAmount ? toCents(parseFloat(targetAmount)) : undefined,
        targetDate: targetDate || undefined,
        linkedAccountId: linkedAccountId || undefined,
        visibility,
      });
    } else {
      updateMutation.mutate({
        id: fundId!,
        name: name.trim(),
        icon: icon.trim() || undefined,
        monthlyContribution: toCents(parseFloat(monthlyContribution) || 0),
        targetAmount: targetAmount ? toCents(parseFloat(targetAmount)) : null,
        targetDate: targetDate || null,
        linkedAccountId: linkedAccountId || null,
      });
    }
  };

  const handleAddEntry = () => {
    if (!fundId || !entryAmount) return;
    const now = new Date();
    addEntryMutation.mutate({
      fundId,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      type: entryType,
      amount: toCents(parseFloat(entryAmount) || 0),
      note: entryNote.trim() || undefined,
    });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} className="max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {isCreate ? t(lang, "tracker.funds.addFund") : t(lang, "tracker.funds.editFund")}
          {!isCreate && fund && `: ${fund.name}`}
        </DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-4">
          {/* Form fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex items-center gap-2">
              <div className="shrink-0">
                <Label className="text-xs">Icon</Label>
                <Input
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="💰"
                  className="w-14 text-center"
                  maxLength={4}
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Travel Fund"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">{t(lang, "tracker.funds.contribution")} ({t(lang, "tracker.funds.monthly")})</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={monthlyContribution}
                onChange={(e) => setMonthlyContribution(e.target.value)}
                placeholder="200.00"
              />
            </div>

            <div>
              <Label className="text-xs">{t(lang, "tracker.funds.target")} (optional)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="3000.00"
              />
            </div>

            <div>
              <Label className="text-xs">Target date (optional)</Label>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>

            <div>
              <Label className="text-xs">{t(lang, "tracker.funds.linkedTo")}</Label>
              <select
                value={linkedAccountId}
                onChange={(e) => setLinkedAccountId(e.target.value)}
                className="w-full h-9 rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="">None</option>
                {accounts.map((acc: { id: string; name: string }) => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Entry history (edit mode only) */}
          {!isCreate && fund && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t(lang, "tracker.funds.history")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => setShowAddEntry(!showAddEntry)}
                >
                  <Plus className="h-3 w-3" />
                  {t(lang, "tracker.funds.addEntry")}
                </Button>
              </div>

              {/* Add entry form */}
              {showAddEntry && (
                <div className="flex items-end gap-2 p-2 rounded-md bg-muted/30">
                  <div className="flex-1">
                    <select
                      value={entryType}
                      onChange={(e) => setEntryType(e.target.value as typeof entryType)}
                      className="w-full h-8 rounded-md border bg-transparent px-2 text-xs"
                    >
                      <option value="CONTRIBUTION">{t(lang, "tracker.funds.contribution")}</option>
                      <option value="WITHDRAWAL">{t(lang, "tracker.funds.withdrawal")}</option>
                      <option value="ADJUSTMENT">{t(lang, "tracker.funds.adjustment")}</option>
                    </select>
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={entryAmount}
                      onChange={(e) => setEntryAmount(e.target.value)}
                      placeholder="0.00"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      value={entryNote}
                      onChange={(e) => setEntryNote(e.target.value)}
                      placeholder="Note..."
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={handleAddEntry}
                    disabled={!entryAmount || addEntryMutation.isPending}
                  >
                    Add
                  </Button>
                </div>
              )}

              {/* Entry list */}
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {fund.entries.length === 0 && (
                  <p className="text-xs text-muted-foreground/50 py-2 text-center">No entries yet</p>
                )}
                {fund.entries.map((entry: {
                  id: string;
                  fundId: string;
                  year: number;
                  month: number;
                  type: "CONTRIBUTION" | "WITHDRAWAL" | "ADJUSTMENT";
                  amount: number;
                  note: string | null;
                  createdAt: Date;
                }) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between py-1 px-2 rounded text-xs hover:bg-muted/30 group"
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "font-medium",
                        entry.type === "CONTRIBUTION" && "text-green-600 dark:text-green-400",
                        entry.type === "WITHDRAWAL" && "text-red-600 dark:text-red-400",
                        entry.type === "ADJUSTMENT" && "text-blue-600 dark:text-blue-400",
                      )}>
                        {entry.type === "CONTRIBUTION" ? "+" : entry.type === "WITHDRAWAL" ? "-" : "±"}
                        <MoneyDisplay amount={entry.amount} colorize={false} className="text-xs inline" />
                      </span>
                      <span className="text-muted-foreground">
                        {t(lang, `tracker.funds.${entry.type.toLowerCase()}` as Parameters<typeof t>[1])}
                      </span>
                      {entry.note && (
                        <span className="text-muted-foreground/60">— {entry.note}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground/60">
                        {entry.month}/{entry.year}
                      </span>
                      <button
                        onClick={() => deleteEntryMutation.mutate({ entryId: entry.id })}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-600 transition-opacity"
                        aria-label="Delete entry"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2 border-t">
            {!isCreate ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-950/40 gap-1"
                  onClick={() => deleteMutation.mutate({ id: fundId! })}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t(lang, "tracker.funds.deleteFund")}
                </Button>
              </div>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                {t(lang, "common.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!name.trim() || isPending}
                className="gap-1"
              >
                <Save className="h-3.5 w-3.5" />
                {isPending ? t(lang, "common.saving") : t(lang, "common.save")}
              </Button>
            </div>
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
}
