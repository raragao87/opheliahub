"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MoneyDisplay } from "@/components/shared/money-display";
import { VisibilityBadge } from "@/components/shared/visibility-badge";
import { formatDate } from "@/lib/date";
import { fromCents, toCents } from "@/lib/money";
import { ACCOUNT_TYPE_META } from "@/lib/account-types";
import {
  ArrowLeft,
  ArrowLeftRight,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  Save,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Wallet,
} from "lucide-react";

export default function AccountDetailPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
      <AccountDetailContent />
    </Suspense>
  );
}

function AccountDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const accountId = params.id as string;
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const accountQuery = useQuery(trpc.account.getById.queryOptions({ id: accountId }));
  const transactionsQuery = useQuery(
    trpc.transaction.list.queryOptions({ accountId, limit: 100 })
  );

  const [editing, setEditing] = useState(false);
  const [editFormInitialized, setEditFormInitialized] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    type: "",
    ownership: "" as "PERSONAL" | "SHARED",
    institution: "",
    currency: "",
    initialBalance: "",
  });
  const [deleteStep, setDeleteStep] = useState<"idle" | "choose" | "confirm-force">("idle");

  // Auto-open edit mode when ?edit is in the URL, once account data loads
  const wantsEdit = searchParams.get("edit") !== null;
  const account = accountQuery.data;
  const transactions = transactionsQuery.data?.transactions ?? [];

  // Find the "Initial Balance" transaction (always the one with that description)
  const initialBalanceTxn = useMemo(() => {
    return transactions.find((t) => t.description === "Initial Balance") ?? null;
  }, [transactions]);

  useEffect(() => {
    if (wantsEdit && account && !editFormInitialized) {
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
      setEditing(true);
      setEditFormInitialized(true);
    }
  }, [wantsEdit, account, editFormInitialized, initialBalanceTxn]);

  const updateMutation = useMutation(
    trpc.account.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setEditing(false);
      },
    })
  );

  const updateTransactionMutation = useMutation(
    trpc.transaction.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
      },
    })
  );

  const createTransactionMutation = useMutation(
    trpc.transaction.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
      },
    })
  );

  const deleteMutation = useMutation(
    trpc.account.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        router.push("/accounts");
      },
    })
  );

  if (accountQuery.isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (!account) {
    return <div className="text-red-600">Account not found.</div>;
  }

  const meta = ACCOUNT_TYPE_META[account.type];
  const Icon = meta?.icon ?? Wallet;
  const typeLabel = meta?.label ?? account.type;

  // Monthly stats from transactions
  const now = new Date();
  const thisMonth = transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthIncome = thisMonth
    .filter((t) => t.type === "INCOME")
    .reduce((s, t) => s + t.amount, 0);
  const monthExpenses = thisMonth
    .filter((t) => t.type === "EXPENSE")
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const startEditing = () => {
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
    setEditing(true);
  };

  const handleSave = async () => {
    // 1. Update account fields
    updateMutation.mutate({
      id: accountId,
      name: editForm.name,
      type: editForm.type as Parameters<typeof updateMutation.mutate>[0]["type"],
      ownership: editForm.ownership,
      institution: editForm.institution || null,
      currency: editForm.currency,
    });

    // 2. Handle Initial Balance transaction
    const isLiability = ACCOUNT_TYPE_META[editForm.type]?.isLiability;
    const rawAmount = editForm.initialBalance
      ? toCents(parseFloat(editForm.initialBalance))
      : 0;
    const newAmount = isLiability ? -Math.abs(rawAmount) : rawAmount;
    const newType = newAmount >= 0 ? "INCOME" : "EXPENSE";

    if (initialBalanceTxn) {
      // Update existing Initial Balance transaction if amount changed
      if (newAmount !== initialBalanceTxn.amount) {
        updateTransactionMutation.mutate({
          id: initialBalanceTxn.id,
          amount: newAmount,
          type: newType as "INCOME" | "EXPENSE",
        });
      }
    } else {
      // Create Initial Balance transaction for legacy accounts
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
    updateMutation.mutate({
      id: accountId,
      isActive: !account.isActive,
    });
  };

  const isLiabilityType = ACCOUNT_TYPE_META[editForm.type]?.isLiability;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex-1">
          {!editing && (
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-muted">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{account.name}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm text-muted-foreground">{typeLabel}</span>
                  {account.institution && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-sm text-muted-foreground">{account.institution}</span>
                    </>
                  )}
                  <VisibilityBadge
                    visibility={account.ownership === "SHARED" ? "SHARED" : "PERSONAL"}
                  />
                  {!account.isActive && (
                    <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300">
                      Archived
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
          {editing && (
            <h1 className="text-2xl font-bold">Edit Account</h1>
          )}
        </div>

        {/* Action buttons — only View Transactions and Edit */}
        {!editing && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/transactions?accountId=${accountId}`)}
              title="View Transactions"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={startEditing} title="Edit">
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>Account Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Account Name</Label>
                <Input
                  id="edit-name"
                  placeholder="e.g., ING Checking, AMEX Gold"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-type">Account Type</Label>
                  <Select
                    id="edit-type"
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
                  <Label htmlFor="edit-ownership">Ownership</Label>
                  <Select
                    id="edit-ownership"
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
                <Label htmlFor="edit-institution">Bank / Institution</Label>
                <Input
                  id="edit-institution"
                  placeholder="e.g., ING, ABN AMRO, Bunq"
                  value={editForm.institution}
                  onChange={(e) => setEditForm({ ...editForm, institution: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-currency">Currency</Label>
                  <Select
                    id="edit-currency"
                    value={editForm.currency}
                    onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-initial-balance">
                    {isLiabilityType ? "Amount Owed" : "Initial Balance"}
                  </Label>
                  <Input
                    id="edit-initial-balance"
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

              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={() => setEditing(false)} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!editForm.name || updateMutation.isPending || updateTransactionMutation.isPending || createTransactionMutation.isPending}
                  className="flex-1"
                >
                  {updateMutation.isPending || updateTransactionMutation.isPending || createTransactionMutation.isPending ? (
                    "Saving..."
                  ) : (
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
              {updateTransactionMutation.error && (
                <p className="text-sm text-red-600">{updateTransactionMutation.error.message}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Danger Zone — visible in edit mode */}
      {editing && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Danger Zone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Archive / Reactivate */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {account.isActive ? "Archive Account" : "Reactivate Account"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {account.isActive
                      ? "Archived accounts are hidden from the sidebar and not included in totals."
                      : "Reactivating will make this account visible again."}
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
                      <Archive className="h-4 w-4 mr-1" />
                      Archive
                    </>
                  ) : (
                    <>
                      <ArchiveRestore className="h-4 w-4 mr-1" />
                      Reactivate
                    </>
                  )}
                </Button>
              </div>

              <div className="border-t" />

              {/* Delete */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Delete Account</p>
                    <p className="text-xs text-muted-foreground">
                      Permanently delete this account.
                    </p>
                  </div>
                  {deleteStep === "idle" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteStep("choose")}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  )}
                </div>

                {deleteStep === "choose" && transactions.length > 0 && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950 space-y-3">
                    <p className="text-sm text-red-800 dark:text-red-200">
                      This account has <strong>{transactions.length} transaction{transactions.length !== 1 ? "s" : ""}</strong>. What would you like to do?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => setDeleteStep("confirm-force")}
                      >
                        Delete account &amp; all transactions
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate({ id: accountId })}
                      >
                        Archive instead
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteStep("idle")}
                      >
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
                        variant="destructive"
                        size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate({ id: accountId })}
                      >
                        {deleteMutation.isPending ? "Deleting..." : "Yes, delete permanently"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteStep("idle")}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {deleteStep === "confirm-force" && (
                  <div className="mt-3 rounded-lg border border-red-300 bg-red-100 p-3 dark:border-red-700 dark:bg-red-900 space-y-3">
                    <p className="text-sm font-medium text-red-900 dark:text-red-100">
                      This will permanently delete {account.name} and all {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}. This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate({ id: accountId, force: true })}
                      >
                        {deleteMutation.isPending ? "Deleting..." : "Yes, delete everything"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteStep("choose")}
                      >
                        Go back
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Balance + monthly stats */}
      {!editing && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <MoneyDisplay
                  amount={account.balance}
                  currency={account.currency}
                  className="text-2xl font-bold"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                  This Month In
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MoneyDisplay
                  amount={monthIncome}
                  className="text-2xl font-bold"
                  colorize={false}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <TrendingDown className="h-3.5 w-3.5 text-red-600" />
                  This Month Out
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MoneyDisplay
                  amount={-monthExpenses}
                  className="text-2xl font-bold"
                  colorize={false}
                />
              </CardContent>
            </Card>
          </div>

          {/* Transactions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Transactions
                {transactions.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({transactions.length})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No transactions yet for this account.
                </p>
              ) : (
                <div className="divide-y">
                  {transactions.map((txn) => (
                    <div
                      key={txn.id}
                      className="flex items-center gap-3 py-3 cursor-pointer hover:bg-muted/50 -mx-6 px-6 transition-colors"
                      onClick={() => router.push(`/transactions/${txn.id}/edit`)}
                    >
                      <span className="text-lg shrink-0">{txn.category?.icon ?? "?"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {txn.displayName || txn.description}
                        </p>
                        {txn.displayName && txn.displayName !== txn.description && (
                          <p
                            className="text-xs text-muted-foreground/50 truncate"
                            title={txn.description}
                          >
                            {txn.description.length > 60
                              ? txn.description.slice(0, 60) + "..."
                              : txn.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {formatDate(txn.date)}
                          </span>
                          {txn.category && (
                            <span className="text-xs text-muted-foreground">
                              · {txn.category.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <MoneyDisplay amount={txn.amount} className="text-sm font-medium shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
