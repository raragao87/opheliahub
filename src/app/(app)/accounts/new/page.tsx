"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toCents } from "@/lib/money";
import { ACCOUNT_TYPE_META } from "@/lib/account-types";

const LIABILITY_TYPES = new Set(
  Object.entries(ACCOUNT_TYPE_META)
    .filter(([, meta]) => meta.isLiability)
    .map(([key]) => key)
);

export default function NewAccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: "",
    type: searchParams.get("type") ?? "CHECKING",
    ownership: "PERSONAL" as const,
    institution: "",
    currency: "EUR",
    balance: "",
  });

  const createMutation = useMutation(
    trpc.account.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        router.push("/accounts");
      },
    })
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rawBalance = form.balance ? toCents(parseFloat(form.balance)) : 0;
    // Liabilities are stored as negative (user enters positive)
    const balance = LIABILITY_TYPES.has(form.type) ? -Math.abs(rawBalance) : rawBalance;

    createMutation.mutate({
      name: form.name,
      type: form.type as Parameters<typeof createMutation.mutate>[0]["type"],
      ownership: form.ownership,
      institution: form.institution || undefined,
      currency: form.currency,
      balance,
    });
  };

  const isLiability = LIABILITY_TYPES.has(form.type);

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-3xl font-bold mb-6">Add Account</h1>

      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Account Name</Label>
              <Input
                id="name"
                placeholder="e.g., ING Checking, AMEX Gold"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Account Type</Label>
                <Select
                  id="type"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <optgroup label="Spending">
                    <option value="CHECKING">Checking</option>
                    <option value="CREDIT_CARD">Credit Card</option>
                    <option value="CASH">Cash</option>
                  </optgroup>
                  <optgroup label="Investment">
                    <option value="SAVINGS">Savings</option>
                    <option value="INVESTMENT">Investment</option>
                    <option value="CRYPTO">Crypto</option>
                  </optgroup>
                  <optgroup label="Assets & Debts">
                    <option value="PROPERTY">Property</option>
                    <option value="VEHICLE">Vehicle</option>
                    <option value="OTHER_ASSET">Other Asset</option>
                    <option value="LOAN">Loan</option>
                    <option value="MORTGAGE">Mortgage</option>
                    <option value="OTHER_DEBT">Other Debt</option>
                  </optgroup>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ownership">Ownership</Label>
                <Select
                  id="ownership"
                  value={form.ownership}
                  onChange={(e) =>
                    setForm({ ...form, ownership: e.target.value as typeof form.ownership })
                  }
                >
                  <option value="PERSONAL">Personal</option>
                  <option value="SHARED">Shared / Joint</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="institution">Bank / Institution</Label>
              <Input
                id="institution"
                placeholder="e.g., ING, ABN AMRO, Bunq"
                value={form.institution}
                onChange={(e) => setForm({ ...form, institution: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="balance">
                  {isLiability ? "Amount Owed" : "Starting Balance"}
                </Label>
                <Input
                  id="balance"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.balance}
                  onChange={(e) => setForm({ ...form, balance: e.target.value })}
                />
                {isLiability && (
                  <p className="text-[11px] text-muted-foreground">
                    Enter as positive — will be stored as a liability.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  id="currency"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </Select>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={!form.name || createMutation.isPending} className="flex-1">
                {createMutation.isPending ? "Creating..." : "Create Account"}
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
