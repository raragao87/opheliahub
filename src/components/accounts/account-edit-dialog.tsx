"use client";

import { useState, useEffect, useMemo } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogHeader, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ACCOUNT_TYPE_META } from "@/lib/account-types";
import { fromCents, toCents } from "@/lib/money";
import {
  Save,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Trash2,
  ArrowLeftRight,
} from "lucide-react";

interface AccountEditDialogProps {
  accountId: string;
  open: boolean;
  onClose: () => void;
}

export function AccountEditDialog({ accountId, open, onClose }: AccountEditDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const accountQuery = useQuery(trpc.account.getById.queryOptions({ id: accountId }));
  const transactionsQuery = useQuery(
    trpc.transaction.list.queryOptions({ accountId, limit: 100 })
  );
  const account = accountQuery.data;
  const transactions = transactionsQuery.data?.transactions ?? [];

  const initialBalanceTxn = useMemo(() => {
    return transactions.find((t) => t.description === "Initial Balance") ?? null;
  }, [transactions]);

  const [editForm, setEditForm] = useState({
    name: "",
    type: "",
    ownership: "" as "PERSONAL" | "SHARED",
    institution: "",
    currency: "",
    initialBalance: "",
  });
  const [formInit, setFormInit] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"idle" | "choose" | "confirm-force">("idle");
  const [flipConfirm, setFlipConfirm] = useState(false);

  // Initialize form when account data loads
  useEffect(() => {
    if (account && open && !formInit) {
      const isLiability = ACCOUNT_TYPE_META[account.type]?.isLiability;
      const ibAmount = initialBalanceTxn?.amount ?? 0;
      const displayAmount = isLiability ? Math.abs(ibAmount) : ibAmount;

      setEditForm({
        name: account.name,
        type: account.type,
        ownership: account.ownership as "PERSONAL" | "SHARED",
        institution: account.institution ?? "",
        currency: account.currency,
        initialBalance: displayAmount !== 0 ? fromCents(displayAmount).toString() : "",
      });
      setFormInit(true);
    }
  }, [account, open, formInit, initialBalanceTxn]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setFormInit(false);
      setDeleteStep("idle");
      setFlipConfirm(false);
    }
  }, [open]);

  const updateMutation = useMutation(
    trpc.account.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        onClose();
      },
    })
  );

  const updateTransactionMutation = useMutation(
    trpc.transaction.update.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    })
  );

  const createTransactionMutation = useMutation(
    trpc.transaction.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    })
  );

  const deleteMutation = useMutation(
    trpc.account.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        onClose();
      },
    })
  );

  const flipMutation = useMutation(
    trpc.account.flipTransactionSigns.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setFlipConfirm(false);
      },
    })
  );

  const handleSave = () => {
    updateMutation.mutate({
      id: accountId,
      name: editForm.name,
      type: editForm.type as Parameters<typeof updateMutation.mutate>[0]["type"],
      ownership: editForm.ownership,
      institution: editForm.institution || null,
      currency: editForm.currency,
    });

    const isLiability = ACCOUNT_TYPE_META[editForm.type]?.isLiability;
    const rawAmount = editForm.initialBalance
      ? toCents(parseFloat(editForm.initialBalance))
      : 0;
    const newAmount = isLiability ? -Math.abs(rawAmount) : rawAmount;
    const newType = newAmount >= 0 ? "INCOME" : "EXPENSE";

    if (initialBalanceTxn) {
      if (newAmount !== initialBalanceTxn.amount) {
        updateTransactionMutation.mutate({
          id: initialBalanceTxn.id,
          amount: newAmount,
          type: newType as "INCOME" | "EXPENSE",
        });
      }
    } else {
      createTransactionMutation.mutate({
        accountId,
        amount: newAmount,
        type: newType as "INCOME" | "EXPENSE",
        description: "Initial Balance",
        date: new Date(),
        visibility: editForm.ownership,
      });
    }
  };

  const handleToggleArchive = () => {
    if (!account) return;
    updateMutation.mutate({ id: accountId, isActive: !account.isActive });
  };

  const isLiabilityType = ACCOUNT_TYPE_META[editForm.type]?.isLiability;
  const isSaving = updateMutation.isPending || updateTransactionMutation.isPending || createTransactionMutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader onClose={onClose}>
        <DialogTitle>Account Settings</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dlg-name">Account Name</Label>
            <Input
              id="dlg-name"
              placeholder="e.g., ING Checking, AMEX Gold"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dlg-type">Account Type</Label>
              <Select
                id="dlg-type"
                value={editForm.type}
                onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
              >
                <optgroup label="Budget">
                  <option value="CHECKING">Checking</option>
                  <option value="SAVINGS">Savings</option>
                  <option value="CREDIT_CARD">Credit Card</option>
                  <option value="CASH">Cash</option>
                </optgroup>
                <optgroup label="Tracking">
                  <option value="INVESTMENT">Investment</option>
                  <option value="CRYPTO">Crypto</option>
                  <option value="PROPERTY">Property</option>
                  <option value="VEHICLE">Vehicle</option>
                  <option value="OTHER_ASSET">Other Asset</option>
                </optgroup>
                <optgroup label="Loans">
                  <option value="LOAN">Loan</option>
                  <option value="MORTGAGE">Mortgage</option>
                  <option value="OTHER_DEBT">Other Debt</option>
                </optgroup>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dlg-ownership">Ownership</Label>
              <Select
                id="dlg-ownership"
                value={editForm.ownership}
                onChange={(e) =>
                  setEditForm({ ...editForm, ownership: e.target.value as "PERSONAL" | "SHARED" })
                }
              >
                <option value="PERSONAL">Personal</option>
                <option value="SHARED">Shared / Joint</option>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dlg-institution">Bank / Institution</Label>
            <Input
              id="dlg-institution"
              placeholder="e.g., ING, ABN AMRO, Bunq"
              value={editForm.institution}
              onChange={(e) => setEditForm({ ...editForm, institution: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dlg-currency">Currency</Label>
              <Select
                id="dlg-currency"
                value={editForm.currency}
                onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dlg-initial-balance">
                {isLiabilityType ? "Amount Owed" : "Initial Balance"}
              </Label>
              <Input
                id="dlg-initial-balance"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={editForm.initialBalance}
                onChange={(e) =>
                  setEditForm({ ...editForm, initialBalance: e.target.value })
                }
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!editForm.name || isSaving}
              className="flex-1"
            >
              {isSaving ? "Saving..." : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Save Changes
                </>
              )}
            </Button>
          </div>

          {updateMutation.error && (
            <p className="text-sm text-red-600">{updateMutation.error.message}</p>
          )}

          {/* ── Danger Zone ────────────────────────────────────────── */}
          <div className="border-t border-red-200 dark:border-red-800 pt-4 mt-4">
            <p className="text-sm font-medium text-red-600 dark:text-red-400 flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4" />
              Danger Zone
            </p>

            <div className="space-y-3">
              {/* Fix Transaction Signs — liability accounts only */}
              {account && ACCOUNT_TYPE_META[account.type]?.isLiability && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Fix Transaction Signs</p>
                      <p className="text-xs text-muted-foreground">
                        Flip all transaction amounts.
                      </p>
                    </div>
                    {!flipConfirm ? (
                      <Button variant="outline" size="sm" onClick={() => setFlipConfirm(true)}>
                        <ArrowLeftRight className="h-3.5 w-3.5 mr-1" />
                        Fix Signs
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={flipMutation.isPending}
                          onClick={() => flipMutation.mutate({ id: accountId })}
                        >
                          {flipMutation.isPending ? "Fixing..." : "Yes, flip all"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setFlipConfirm(false)}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="border-t" />
                </>
              )}

              {/* Archive / Reactivate */}
              {account && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {account.isActive ? "Archive Account" : "Reactivate Account"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {account.isActive
                        ? "Hidden from sidebar and totals."
                        : "Make visible again."}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleArchive}
                    disabled={updateMutation.isPending}
                  >
                    {account.isActive ? (
                      <>
                        <Archive className="h-3.5 w-3.5 mr-1" />
                        Archive
                      </>
                    ) : (
                      <>
                        <ArchiveRestore className="h-3.5 w-3.5 mr-1" />
                        Reactivate
                      </>
                    )}
                  </Button>
                </div>
              )}

              <div className="border-t" />

              {/* Delete */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Delete Account</p>
                    <p className="text-xs text-muted-foreground">Permanently delete this account.</p>
                  </div>
                  {deleteStep === "idle" && (
                    <Button variant="destructive" size="sm" onClick={() => setDeleteStep("choose")}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Delete
                    </Button>
                  )}
                </div>

                {deleteStep === "choose" && transactions.length > 0 && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950 space-y-3">
                    <p className="text-sm text-red-800 dark:text-red-200">
                      This account has <strong>{transactions.length} transactions</strong>. What would you like to do?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="destructive" size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => setDeleteStep("confirm-force")}
                      >
                        Delete account &amp; all transactions
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate({ id: accountId })}
                      >
                        Archive instead
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteStep("idle")}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {deleteStep === "choose" && transactions.length === 0 && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950 space-y-3">
                    <p className="text-sm text-red-800 dark:text-red-200">
                      Are you sure? This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive" size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate({ id: accountId })}
                      >
                        {deleteMutation.isPending ? "Deleting..." : "Yes, delete permanently"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteStep("idle")}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {deleteStep === "confirm-force" && account && (
                  <div className="mt-3 rounded-lg border border-red-300 bg-red-100 p-3 dark:border-red-700 dark:bg-red-900 space-y-3">
                    <p className="text-sm font-medium text-red-900 dark:text-red-100">
                      This will permanently delete {account.name} and all {transactions.length} transactions. This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive" size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate({ id: accountId, force: true })}
                      >
                        {deleteMutation.isPending ? "Deleting..." : "Yes, delete everything"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteStep("choose")}>
                        Go back
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
}
