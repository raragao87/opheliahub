"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { CategorySelect } from "@/components/shared/category-select";
import { toCents } from "@/lib/money";
import { ACCOUNT_TYPE_META } from "@/lib/account-types";

export default function NewTransactionPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const accountsQuery = useQuery(trpc.account.list.queryOptions());
  const tagsQuery = useQuery(trpc.tag.list.queryOptions({}));

  const [form, setForm] = useState({
    description: "",
    amount: "",
    type: "EXPENSE" as "INCOME" | "EXPENSE" | "TRANSFER",
    date: new Date().toISOString().split("T")[0],
    accountId: "",
    toAccountId: "",
    categoryId: "",
    notes: "",
    tagIds: [] as string[],
    investmentAssetId: "",
    quantity: "",
    unitPrice: "",
  });

  const assetsQuery = useQuery(trpc.investmentAsset.list.queryOptions());

  const createMutation = useMutation(
    trpc.transaction.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        router.push("/transactions");
      },
    })
  );

  const selectedAccount = (accountsQuery.data ?? []).find((a) => a.id === form.accountId);
  const isIlliquidAccount = selectedAccount
    ? ACCOUNT_TYPE_META[selectedAccount.type]?.sidebarGroup !== "SPENDING"
    : false;
  const isInvestmentAccount = selectedAccount
    ? ACCOUNT_TYPE_META[selectedAccount.type]?.sidebarGroup === "INVESTMENT"
    : false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = toCents(parseFloat(form.amount));
    // Transfers: always positive (backend handles signs for both sides)
    const signedAmount =
      form.type === "EXPENSE"
        ? -Math.abs(amountCents)
        : Math.abs(amountCents);

    createMutation.mutate({
      description: form.description,
      amount: signedAmount,
      type: form.type,
      date: new Date(form.date),
      accountId: form.accountId,
      toAccountId: form.type === "TRANSFER" ? form.toAccountId || undefined : undefined,
      categoryId: form.type === "TRANSFER" ? undefined : form.categoryId || undefined,
      notes: form.notes || undefined,
      tagIds: form.tagIds,
      ...(isInvestmentAccount && form.investmentAssetId && {
        investmentAssetId: form.investmentAssetId,
      }),
      ...(isInvestmentAccount && form.quantity && {
        quantity: parseFloat(form.quantity),
      }),
      ...(isInvestmentAccount && form.unitPrice && {
        unitPrice: Math.round(parseFloat(form.unitPrice) * 100),
      }),
    });
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-3xl font-bold mb-6">Add Transaction</h1>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type selector */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              {(["EXPENSE", "INCOME", "TRANSFER"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm({ ...form, type })}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                    form.type === type
                      ? type === "EXPENSE"
                        ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"
                        : type === "INCOME"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"
                      : "text-muted-foreground"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="e.g., Albert Heijn groceries"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
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

            <div className="space-y-2">
              <Label htmlFor="account">
                {form.type === "TRANSFER" ? "From Account" : "Account"}
              </Label>
              <Select
                id="account"
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                required
              >
                <option value="">Select account...</option>
                {(accountsQuery.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>

            {/* To Account — only for transfers */}
            {form.type === "TRANSFER" && (
              <div className="space-y-2">
                <Label htmlFor="toAccount">To Account</Label>
                <Select
                  id="toAccount"
                  value={form.toAccountId}
                  onChange={(e) => setForm({ ...form, toAccountId: e.target.value })}
                  required
                >
                  <option value="">Select target account...</option>
                  {(accountsQuery.data ?? [])
                    .filter((a) => a.id !== form.accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </Select>
              </div>
            )}

            {/* Category — hidden for transfers and assets/debts accounts */}
            {form.type !== "TRANSFER" && !(isIlliquidAccount && !isInvestmentAccount) && selectedAccount && (
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <CategorySelect
                  id="category"
                  value={form.categoryId}
                  onChange={(val) => setForm({ ...form, categoryId: val })}
                  visibility={selectedAccount.ownership as "SHARED" | "PERSONAL"}
                  categoryType={ACCOUNT_TYPE_META[selectedAccount.type]?.sidebarGroup === "INVESTMENT" ? "INVESTMENT" : undefined}
                />
              </div>
            )}

            {/* Investment Details */}
            {isInvestmentAccount && form.type !== "TRANSFER" && (
              <div className="space-y-3 border-t pt-4">
                <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400">Investment Details</h3>
                <div className="space-y-2">
                  <Label htmlFor="asset">Asset</Label>
                  <Select
                    id="asset"
                    value={form.investmentAssetId}
                    onChange={(e) => setForm({ ...form, investmentAssetId: e.target.value })}
                  >
                    <option value="">No asset</option>
                    {(assetsQuery.data ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.ticker ? `${a.ticker} — ${a.name}` : a.name} ({a.type})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      step="0.00000001"
                      placeholder="e.g. 10"
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unitPrice">Price per unit</Label>
                    <Input
                      id="unitPrice"
                      type="number"
                      step="0.01"
                      placeholder="e.g. 150.25"
                      value={form.unitPrice}
                      onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
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
              {(tagsQuery.data ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {(tagsQuery.data ?? []).map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => {
                        const ids = form.tagIds.includes(tag.id)
                          ? form.tagIds.filter((id) => id !== tag.id)
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

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !form.description ||
                  !form.amount ||
                  !form.accountId ||
                  (form.type === "TRANSFER" && !form.toAccountId) ||
                  createMutation.isPending
                }
                className="flex-1"
              >
                {createMutation.isPending ? "Saving..." : "Save Transaction"}
              </Button>
            </div>

            {createMutation.error && (
              <p className="text-sm text-red-600">{createMutation.error.message}</p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
