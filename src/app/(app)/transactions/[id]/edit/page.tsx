"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MoneyDisplay } from "@/components/shared/money-display";
import { CategorySelect } from "@/components/shared/category-select";
import { fromCents, toCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { ArrowLeft, ArrowLeftRight, Trash2, Save, Sparkles } from "lucide-react";
import { ACCOUNT_TYPE_META } from "@/lib/account-types";

export default function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const txnQuery = useQuery(trpc.transaction.getById.queryOptions({ id }));
  const tagsQuery = useQuery(trpc.tag.list.queryOptions({}));

  const [form, setForm] = useState<{
    displayName: string;
    description: string;
    amount: string;
    type: "INCOME" | "EXPENSE" | "TRANSFER";
    date: string;
    accrualDate: string;
    categoryId: string;
    notes: string;
    tagIds: string[];
  } | null>(null);

  const [showDelete, setShowDelete] = useState(false);

  // Populate form once transaction loads
  useEffect(() => {
    if (txnQuery.data && !form) {
      const txn = txnQuery.data;
      setForm({
        displayName: txn.displayName ?? txn.description,
        description: txn.description,
        amount: String(Math.abs(fromCents(txn.amount))),
        type: txn.type as "INCOME" | "EXPENSE" | "TRANSFER",
        date: new Date(txn.date).toISOString().split("T")[0],
        accrualDate: txn.accrualDate ? new Date(txn.accrualDate).toISOString().split("T")[0] : "",
        categoryId: txn.categoryId ?? "",
        notes: txn.notes ?? "",
        tagIds: txn.tags.map((t: { tag: { id: string } }) => t.tag.id),
      });
    }
  }, [txnQuery.data, form]);

  const updateMutation = useMutation(
    trpc.transaction.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        router.push("/transactions");
      },
    })
  );

  const deleteMutation = useMutation(
    trpc.transaction.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        router.push("/transactions");
      },
    })
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    const amountCents = toCents(parseFloat(form.amount));
    const signedAmount = form.type === "EXPENSE" ? -Math.abs(amountCents) : Math.abs(amountCents);

    updateMutation.mutate({
      id,
      displayName: form.displayName || null,
      description: form.description,
      amount: signedAmount,
      type: form.type,
      date: new Date(form.date),
      accrualDate: form.accrualDate ? new Date(form.accrualDate + "T12:00:00") : null,
      categoryId: form.categoryId || null,
      notes: form.notes || null,
      tagIds: form.tagIds,
    });
  };

  if (txnQuery.isLoading || !form) {
    return <div className="text-muted-foreground">Loading transaction...</div>;
  }

  if (txnQuery.error) {
    return <div className="text-red-600">Transaction not found.</div>;
  }

  const tags = tagsQuery.data ?? [];
  const txn = txnQuery.data!;
  const isTransfer = txn.type === "TRANSFER";
  const isIlliquid = ACCOUNT_TYPE_META[txn.account.type]?.sidebarGroup === "ILLIQUID";
  const linkedPartner = (txn as Record<string, unknown>).linkedTransaction ?? (txn as Record<string, unknown>).linkedBy;
  const partnerAccount = linkedPartner ? (linkedPartner as { account?: { name: string } }).account : null;
  const isOutflow = txn.amount < 0;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold">Edit Transaction</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Transfer partner info */}
            {isTransfer && partnerAccount && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                <ArrowLeftRight className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Internal transfer {isOutflow ? "to" : "from"}{" "}
                  <span className="font-medium">{partnerAccount.name}</span>
                </p>
              </div>
            )}
            {isTransfer && !partnerAccount && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                <ArrowLeftRight className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  External transfer — the other account is not tracked
                </p>
              </div>
            )}

            {/* Type selector — disabled for transfers */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              {(["EXPENSE", "INCOME", "TRANSFER"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => !isTransfer && setForm({ ...form, type })}
                  disabled={isTransfer}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                    form.type === type
                      ? type === "EXPENSE"
                        ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"
                        : type === "INCOME"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"
                      : "text-muted-foreground"
                  } ${isTransfer ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="Short, human-readable name"
                maxLength={100}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                required
              />
              {txn.originalDescription && txn.originalDescription !== form.description && (
                <p
                  className="text-xs text-muted-foreground/60 truncate"
                  title={txn.originalDescription}
                >
                  Original: {txn.originalDescription.length > 80
                    ? txn.originalDescription.slice(0, 80) + "..."
                    : txn.originalDescription}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Budget date — overrides which month this transaction counts toward */}
            <div className="space-y-2">
              <Label htmlFor="accrualDate">
                Budget date{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="accrualDate"
                  type="date"
                  value={form.accrualDate}
                  onChange={(e) => setForm({ ...form, accrualDate: e.target.value })}
                  className="flex-1"
                />
                {form.accrualDate && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm({ ...form, accrualDate: "" })}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Set this to move the transaction to a different month&apos;s budget without changing the original date.
              </p>
            </div>

            {/* Category — hidden for transfers and illiquid accounts */}
            {!isTransfer && !isIlliquid && (
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>

                {/* Ophelia suggestion banner — shown when AI has a suggestion and no user category is set */}
                {txn.opheliaCategoryId && !form.categoryId && txn.opheliaCategory && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800">
                    <Sparkles className="h-4 w-4 text-violet-500 dark:text-violet-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-violet-900 dark:text-violet-100">
                        <span className="font-medium">Ophelia suggests:</span>{" "}
                        {txn.opheliaCategory.name}
                        {txn.opheliaConfidence != null && (
                          <span className="ml-1 text-xs text-violet-600 dark:text-violet-400">
                            ({Math.round(txn.opheliaConfidence * 100)}% confidence)
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900"
                      onClick={() => setForm({ ...form, categoryId: txn.opheliaCategoryId! })}
                    >
                      Accept
                    </Button>
                  </div>
                )}

                <CategorySelect
                  id="category"
                  value={form.categoryId}
                  onChange={(val) => setForm({ ...form, categoryId: val })}
                  visibility={txn.visibility as "SHARED" | "PERSONAL"}
                />
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                placeholder="Any additional notes..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label>Tags</Label>
              {tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => {
                        const ids = form.tagIds.includes(tag.id)
                          ? form.tagIds.filter((tid) => tid !== tag.id)
                          : [...form.tagIds, tag.id];
                        setForm({ ...form, tagIds: ids });
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        form.tagIds.includes(tag.id)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-input hover:bg-accent"
                      }`}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No tags created yet.{" "}
                  <a href="/tags" className="underline text-primary hover:text-primary/80">
                    Create tags
                  </a>{" "}
                  to label transactions (e.g., trips, subscriptions).
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setShowDelete(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <div className="flex-1" />
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!form.description || !form.amount || updateMutation.isPending}
              >
                <Save className="h-4 w-4 mr-1" />
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>

            {updateMutation.error && (
              <p className="text-sm text-red-600">{updateMutation.error.message}</p>
            )}
          </form>

          {/* Delete confirmation */}
          {showDelete && (
            <div className="mt-4 p-4 border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                Are you sure you want to delete this transaction?
                {isTransfer && partnerAccount
                  ? ` This will also delete the linked transfer in ${partnerAccount.name} and reverse both balance changes.`
                  : " This will also reverse the balance change on the account."}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate({ id })}
                >
                  {deleteMutation.isPending ? "Deleting..." : "Yes, Delete"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
