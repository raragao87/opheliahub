"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserPreferences } from "@/lib/user-preferences-context";
import { t } from "@/lib/translations";

export function DangerZone({ userEmail }: { userEmail: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const { preferences } = useUserPreferences();
  const lang = preferences.language;

  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [serverError, setServerError] = useState("");

  const statsQuery = useQuery({
    ...trpc.auth.accountStats.queryOptions(),
    enabled: open,
  });
  const stats = statsQuery.data;

  const deleteMutation = useMutation(
    trpc.auth.deleteAccount.mutationOptions({
      onSuccess: async () => {
        await fetch("/api/auth/signout", { method: "POST" });
        router.push("/login?deleted=true");
      },
      onError: (err) => setServerError(err.message),
    })
  );

  const emailMatches = confirmEmail === userEmail;

  function handleClose() {
    if (deleteMutation.isPending) return;
    setOpen(false);
    setConfirmEmail("");
    setServerError("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailMatches || deleteMutation.isPending) return;
    setServerError("");
    deleteMutation.mutate({ confirmEmail });
  }

  return (
    <>
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {t(lang, "danger.title")}
          </CardTitle>
          <CardDescription>{t(lang, "danger.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t(lang, "danger.deleteAccount")}</p>
              <p className="text-sm text-muted-foreground">{t(lang, "danger.deleteDesc")}</p>
            </div>
            <Button
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 shrink-0 ml-4"
              onClick={() => setOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              {t(lang, "danger.deleteBtn")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onClose={handleClose} className="max-w-lg">
        <DialogHeader onClose={handleClose}>
          <DialogTitle>{t(lang, "danger.dialogTitle")}</DialogTitle>
          <DialogDescription>{t(lang, "danger.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-5">
            {statsQuery.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : stats ? (
              <>
                {/* Impact summary */}
                <div className="space-y-3">
                  {/* What will be deleted */}
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-4 space-y-2">
                    <p className="text-sm font-semibold text-red-800 dark:text-red-400">
                      {t(lang, "danger.willDelete")}
                    </p>
                    <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                      {stats.personalAccounts > 0 && (
                        <li>
                          {stats.personalAccounts} personal account
                          {stats.personalAccounts !== 1 ? "s" : ""} and{" "}
                          {stats.personalTransactions} transaction
                          {stats.personalTransactions !== 1 ? "s" : ""}
                        </li>
                      )}
                      {stats.assets > 0 && (
                        <li>
                          {stats.assets} asset{stats.assets !== 1 ? "s" : ""}
                        </li>
                      )}
                      {stats.debts > 0 && (
                        <li>
                          {stats.debts} debt record
                          {stats.debts !== 1 ? "s" : ""}
                        </li>
                      )}
                      {stats.personalAccounts === 0 &&
                        stats.assets === 0 &&
                        stats.debts === 0 && (
                          <li>Your account and all associated data</li>
                        )}
                    </ul>
                  </div>

                  {/* What stays (shared) */}
                  {(stats.sharedAccounts > 0 || stats.sharedTransactions > 0) &&
                    !stats.isOnlyMember && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 p-4 space-y-2">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          {t(lang, "danger.willNotAffect")}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {stats.sharedAccounts} shared account
                          {stats.sharedAccounts !== 1 ? "s" : ""} and{" "}
                          {stats.sharedTransactions} shared transaction
                          {stats.sharedTransactions !== 1 ? "s" : ""} will
                          remain untouched.
                          {stats.partnerName && (
                            <> They will be transferred to {stats.partnerName}.</>
                          )}
                        </p>
                      </div>
                    )}

                  {/* Last member warning */}
                  {stats.isOnlyMember && stats.householdName && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        <span className="font-semibold">
                          {t(lang, "danger.lastMemberWarning")}
                        </span>{" "}
                        The household &ldquo;{stats.householdName}&rdquo; and ALL
                        its data — including shared accounts, transactions, and
                        categories — will also be permanently deleted.
                      </p>
                    </div>
                  )}

                  {/* Ownership transfer notice */}
                  {stats.isHouseholdOwner && stats.partnerName && (
                    <p className="text-sm text-muted-foreground">
                      Household ownership will be transferred to{" "}
                      <span className="font-medium">{stats.partnerName}</span>.
                    </p>
                  )}
                </div>

                {/* Email confirmation */}
                <div className="space-y-2">
                  <Label htmlFor="confirmEmail">
                    Type{" "}
                    <span className="font-mono text-sm bg-muted px-1 py-0.5 rounded">
                      {userEmail}
                    </span>{" "}
                    to confirm:
                  </Label>
                  <Input
                    id="confirmEmail"
                    type="email"
                    placeholder={userEmail}
                    value={confirmEmail}
                    onChange={(e) => {
                      setConfirmEmail(e.target.value);
                      setServerError("");
                    }}
                    className={cn(
                      emailMatches && confirmEmail
                        ? "border-green-500 focus-visible:ring-green-500"
                        : ""
                    )}
                    autoComplete="off"
                  />
                </div>

                {serverError && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {serverError}
                  </p>
                )}
              </>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={deleteMutation.isPending}
            >
              {t(lang, "danger.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!emailMatches || deleteMutation.isPending || statsQuery.isLoading}
              className="bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700 focus-visible:ring-red-500 disabled:bg-red-600/50 disabled:border-red-600/50"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t(lang, "danger.deleting")}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  {t(lang, "danger.confirmDelete")}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
