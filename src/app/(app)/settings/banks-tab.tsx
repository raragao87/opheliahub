"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SelectableCard, SelectableCardGrid } from "@/components/ui/selectable-card";
import { InlineSelectEdit } from "@/components/shared/inline-select-edit";
import { ACCOUNT_TYPE_META } from "@/lib/account-types";
import { useUserPreferences } from "@/lib/user-preferences-context";
import { t } from "@/lib/translations";
import { Landmark, RefreshCw, Loader2, Plus, AlertTriangle } from "lucide-react";

const NEW_ACCOUNT = "__new__";
// A bank feed only makes sense linked to a spending/investment account, not
// an asset/debt (mortgage, vehicle, property). These are the linkable groups.
const LINKABLE_GROUPS = new Set(["SPENDING", "INVESTMENT"]);

/** Settings → Connected banks. Manage PSD2 connections, map accounts, sync. */
export function BanksTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { preferences } = useUserPreferences();
  const lang = preferences.language;

  const connectedId = searchParams.get("connected");
  const errorParam = searchParams.get("error");

  useEffect(() => {
    if (errorParam) {
      toast.error(t(lang, "banks.connectError"));
      router.replace("/settings?tab=banks", { scroll: false });
    }
  }, [errorParam, lang, router]);

  const connectionsQuery = useQuery(trpc.bankConnection.list.queryOptions());
  const accountsQuery = useQuery(trpc.account.list.queryOptions());

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.bankConnection.list.queryOptions().queryKey });

  const syncMutation = useMutation(
    trpc.bankConnection.syncNow.mutationOptions({
      onSuccess: (r) => {
        toast.success(`${r.imported} imported, ${r.skipped} skipped`);
        invalidate();
        queryClient.invalidateQueries();
      },
      onError: (e) => toast.error(e.message),
    })
  );
  const disconnectMutation = useMutation(
    trpc.bankConnection.disconnect.mutationOptions({
      onSuccess: () => { toast.success(t(lang, "banks.disconnect")); invalidate(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const connections = connectionsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
              <Landmark className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>{t(lang, "settings.banks")}</CardTitle>
              <CardDescription>{t(lang, "banks.intro")}</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Post-connect account mapping */}
      {connectedId && (
        <MappingCard
          connectionId={connectedId}
          accounts={accountsQuery.data ?? []}
          lang={lang}
          onDone={() => { invalidate(); router.replace("/settings?tab=banks", { scroll: false }); }}
        />
      )}

      {/* Existing connections */}
      {connections.length === 0 && !connectedId ? (
        <p className="text-sm text-muted-foreground">{t(lang, "banks.noConnections")}</p>
      ) : (
        connections.map((c) => (
          <Card key={c.id}>
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  {c.aspspName}
                  <StatusBadge status={c.status} daysUntilExpiry={c.daysUntilExpiry} lang={lang} />
                </CardTitle>
                <CardDescription>
                  {c.status === "EXPIRED" || c.daysUntilExpiry <= 7
                    ? t(lang, "banks.expiresSoon")
                    : t(lang, "banks.expiresIn").replace("{days}", String(c.daysUntilExpiry))}
                </CardDescription>
              </div>
              <div className="flex gap-2 shrink-0">
                {c.status === "ACTIVE" && (
                  <Button size="sm" variant="outline" disabled={syncMutation.isPending}
                    onClick={() => syncMutation.mutate({ connectionId: c.id })}>
                    {syncMutation.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                    {t(lang, "banks.syncNow")}
                  </Button>
                )}
                <Button size="sm" variant="outline"
                  onClick={() => disconnectMutation.mutate({ connectionId: c.id })}>
                  {t(lang, "banks.disconnect")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {c.links.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t(lang, "banks.noLinkedAccounts")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {c.links.map((l) => (
                    <span key={l.id} className="inline-flex items-center gap-1 text-xs rounded-md border border-border bg-muted/40 px-2 py-1">
                      {l.accountIcon && <span>{l.accountIcon}</span>}
                      {l.accountName}
                      {l.lastSyncedAt && (
                        <span className="text-muted-foreground/60">· {new Date(l.lastSyncedAt).toLocaleDateString(preferences.locale)}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {/* Connect a new bank */}
      {!connectedId && <ConnectCard lang={lang} />}
    </div>
  );
}

function StatusBadge({ status, daysUntilExpiry, lang }: { status: string; daysUntilExpiry: number; lang: ReturnType<typeof useUserPreferences>["preferences"]["language"] }) {
  if (status === "EXPIRED") return <Badge variant="outline" className="text-red-500 border-red-500/40">{t(lang, "banks.status.expired")}</Badge>;
  if (status === "REVOKED") return <Badge variant="outline" className="text-muted-foreground">{t(lang, "banks.status.revoked")}</Badge>;
  if (daysUntilExpiry <= 7) return <Badge variant="outline" className="text-amber-500 border-amber-500/40"><AlertTriangle className="h-3 w-3 mr-0.5" />{t(lang, "banks.status.active")}</Badge>;
  return <Badge variant="outline" className="text-green-500 border-green-500/40">{t(lang, "banks.status.active")}</Badge>;
}

function ConnectCard({ lang }: { lang: ReturnType<typeof useUserPreferences>["preferences"]["language"] }) {
  const trpc = useTRPC();
  const [picking, setPicking] = useState(false);
  const aspspsQuery = useQuery({ ...trpc.bankConnection.listAspsps.queryOptions({ country: "NL" }), enabled: picking });
  const startAuth = useMutation(
    trpc.bankConnection.startAuth.mutationOptions({
      onSuccess: ({ url }) => { window.location.href = url; },
      onError: (e) => toast.error(e.message),
    })
  );

  if (!picking) {
    return (
      <Button onClick={() => setPicking(true)}>
        <Plus className="h-4 w-4 mr-1" /> {t(lang, "banks.connect")}
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t(lang, "banks.connect")}</CardTitle>
        <CardDescription>{t(lang, "banks.pickBank")}</CardDescription>
      </CardHeader>
      <CardContent>
        {aspspsQuery.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <SelectableCardGrid cols={3}>
            {(aspspsQuery.data ?? []).map((a) => (
              <SelectableCard
                key={a.name}
                selected={false}
                onSelect={() => startAuth.mutate({ aspspName: a.name, aspspCountry: a.country })}
                title={a.name}
                description={a.country}
              />
            ))}
          </SelectableCardGrid>
        )}
      </CardContent>
    </Card>
  );
}

interface AccountOption { id: string; name: string; ownership: string; type: string; icon?: string | null; }

function MappingCard({
  connectionId, accounts, lang, onDone,
}: {
  connectionId: string;
  accounts: AccountOption[];
  lang: ReturnType<typeof useUserPreferences>["preferences"]["language"];
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const discoveredQuery = useQuery(trpc.bankConnection.getDiscoveredAccounts.queryOptions({ connectionId }));
  const [choices, setChoices] = useState<Record<string, string>>({}); // uid → financialAccountId | "__new__"
  const [newNames, setNewNames] = useState<Record<string, string>>({});

  const mapMutation = useMutation(
    trpc.bankConnection.mapAccounts.mutationOptions({
      onSuccess: () => { toast.success(t(lang, "banks.mapped")); onDone(); },
      onError: (e) => toast.error(e.message),
    })
  );

  const discovered = (discoveredQuery.data ?? []).filter((d) => !d.alreadyLinked);

  // Only spending/investment accounts are sensible link targets, grouped by
  // ownership so Shared and Personal accounts don't blur together.
  const linkable = accounts.filter((a) => LINKABLE_GROUPS.has(ACCOUNT_TYPE_META[a.type]?.sidebarGroup ?? ""));
  const optionGroups = (["SHARED", "PERSONAL"] as const)
    .map((ownership) => ({
      label: t(lang, ownership === "SHARED" ? "banks.groupShared" : "banks.groupPersonal"),
      options: linkable
        .filter((a) => a.ownership === ownership)
        .map((a) => ({ value: a.id, label: `${a.icon ?? ""} ${a.name}`.trim() })),
    }))
    .filter((g) => g.options.length > 0);
  const nameById = new Map(accounts.map((a) => [a.id, a.name]));
  const displayFor = (uid: string) => {
    const c = choices[uid];
    if (!c) return "";
    if (c === NEW_ACCOUNT) return t(lang, "banks.createNew");
    return nameById.get(c) ?? "";
  };

  function submit() {
    const mappings = discovered
      .filter((d) => choices[d.uid])
      .map((d) => {
        const choice = choices[d.uid];
        if (choice === NEW_ACCOUNT) {
          return { externalAccountId: d.uid, iban: d.iban, displayName: d.name, currency: d.currency,
            createNew: { name: newNames[d.uid] || d.name || "Account", type: "CHECKING" as const } };
        }
        return { externalAccountId: d.uid, iban: d.iban, displayName: d.name, currency: d.currency, financialAccountId: choice };
      });
    if (mappings.length === 0) { onDone(); return; }
    mapMutation.mutate({ connectionId, mappings });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t(lang, "banks.mapAccounts")}</CardTitle>
        <CardDescription>{t(lang, "banks.mapAccountsDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {discoveredQuery.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : discovered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t(lang, "banks.allLinked")}</p>
        ) : (
          discovered.map((d) => (
            <div key={d.uid} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="text-sm font-medium">
                {d.name ?? d.uid}
                {d.iban ? <span className="text-muted-foreground font-normal"> · {d.iban}</span> : null}
              </div>
              <InlineSelectEdit
                value={choices[d.uid] ?? ""}
                displayValue={displayFor(d.uid)}
                placeholder={t(lang, "banks.chooseMapping")}
                allowEmpty={false}
                options={[]}
                optionGroups={optionGroups}
                topOptions={[{ value: NEW_ACCOUNT, label: `+ ${t(lang, "banks.createNew")}` }]}
                onSave={(value) => setChoices((p) => ({ ...p, [d.uid]: value }))}
                className="border border-border rounded-md px-3 py-2 hover:border-muted-foreground/40"
              />
              {choices[d.uid] === NEW_ACCOUNT && (
                <Input
                  placeholder={t(lang, "banks.newAccountName")}
                  value={newNames[d.uid] ?? d.name ?? ""}
                  onChange={(e) => setNewNames((p) => ({ ...p, [d.uid]: e.target.value }))}
                />
              )}
            </div>
          ))
        )}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={mapMutation.isPending}>
            {mapMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {t(lang, "common.save")}
          </Button>
          <Button variant="outline" onClick={onDone}>{t(lang, "common.cancel")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
