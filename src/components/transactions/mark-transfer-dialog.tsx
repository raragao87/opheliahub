"use client";

import { useState, useEffect } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogHeader, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MoneyDisplay } from "@/components/shared/money-display";
import { Loader2, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";

interface MarkTransferDialogProps {
  transaction: {
    id: string;
    description: string;
    displayName?: string | null;
    amount: number;
    date: Date | string;
    account: { id: string; name: string };
  } | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function formatShortDate(d: Date | string) {
  const date = new Date(d);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function MarkTransferDialog({ transaction, open, onClose, onSuccess }: MarkTransferDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null); // null = "no match"

  const matchesQuery = useQuery({
    ...trpc.transaction.findTransferMatches.queryOptions(
      { transactionId: transaction?.id ?? "" }
    ),
    enabled: open && !!transaction,
  });

  // Auto-select first match when data loads
  useEffect(() => {
    if (matchesQuery.data && matchesQuery.data.length > 0) {
      setSelectedMatch(matchesQuery.data[0].id);
    } else {
      setSelectedMatch(null);
    }
  }, [matchesQuery.data]);

  // Reset on close
  useEffect(() => {
    if (!open) setSelectedMatch(null);
  }, [open]);

  const markMutation = useMutation(
    trpc.transaction.markAsTransfer.mutationOptions({
      onSuccess: () => {
        toast.success("Marked as transfer");
        queryClient.invalidateQueries();
        onSuccess();
        onClose();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  if (!transaction) return null;

  const matches = matchesQuery.data ?? [];

  return (
    <Dialog open={open} onClose={onClose} className="max-w-md">
      <DialogHeader onClose={onClose}>
        <DialogTitle>Mark as transfer</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-4">
          {/* Source transaction */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <MoneyDisplay amount={transaction.amount} className="text-sm font-semibold shrink-0" />
                <span className="text-xs text-muted-foreground truncate">{transaction.account.name}</span>
                <span className="text-xs text-muted-foreground">{formatShortDate(transaction.date)}</span>
              </div>
            </div>
            <p className="text-sm mt-1 truncate">
              {transaction.displayName || transaction.description}
            </p>
          </div>

          {/* Match selection */}
          <div>
            <p className="text-sm font-medium mb-2">Link to matching transaction?</p>

            {matchesQuery.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-1.5">
                {matches.map((match) => (
                  <label
                    key={match.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedMatch === match.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="transfer-match"
                      checked={selectedMatch === match.id}
                      onChange={() => setSelectedMatch(match.id)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <MoneyDisplay amount={match.amount} className="text-sm font-semibold shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">{match.account.name}</span>
                        <span className="text-xs text-muted-foreground">{formatShortDate(match.date)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {match.displayName || match.description}
                      </p>
                    </div>
                  </label>
                ))}

                {/* No match option */}
                <label
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    selectedMatch === null
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="transfer-match"
                    checked={selectedMatch === null}
                    onChange={() => setSelectedMatch(null)}
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <p className="text-sm">No match — unlinked transfer</p>
                    <p className="text-xs text-muted-foreground">
                      {matches.length === 0
                        ? "No matching transactions found in other accounts."
                        : "e.g., cash withdrawal or external transfer"}
                    </p>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={() =>
                markMutation.mutate({
                  transactionId: transaction.id,
                  linkedTransactionId: selectedMatch,
                })
              }
              disabled={markMutation.isPending || matchesQuery.isLoading}
              className="flex-1"
            >
              {markMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <ArrowLeftRight className="h-4 w-4 mr-1" />
              )}
              Mark as Transfer
            </Button>
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
}

// ── Unmark Transfer confirmation ──────────────────────────────────────

interface UnmarkTransferDialogProps {
  transaction: {
    id: string;
    amount: number;
  } | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function UnmarkTransferDialog({ transaction, open, onClose, onSuccess }: UnmarkTransferDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const unmarkMutation = useMutation(
    trpc.transaction.unmarkTransfer.mutationOptions({
      onSuccess: () => {
        toast.success("Transfer unmarked");
        queryClient.invalidateQueries();
        onSuccess();
        onClose();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  if (!transaction) return null;

  return (
    <Dialog open={open} onClose={onClose} className="max-w-sm">
      <DialogHeader onClose={onClose}>
        <DialogTitle>Unmark transfer</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Change this transfer back to a regular transaction? If linked, both transactions will be unlinked.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="default"
              disabled={unmarkMutation.isPending}
              onClick={() =>
                unmarkMutation.mutate({
                  transactionId: transaction.id,
                  newType: transaction.amount < 0 ? "EXPENSE" : "INCOME",
                })
              }
              className="flex-1"
            >
              {unmarkMutation.isPending ? "Unmarking..." : `Change to ${transaction.amount < 0 ? "Expense" : "Income"}`}
            </Button>
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
}
