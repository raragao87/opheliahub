"use client";

import { useState, useEffect } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { signOut } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DangerZone } from "@/components/shared/danger-zone";
import { useUserPreferences } from "@/lib/user-preferences-context";
import { t } from "@/lib/translations";
import { Loader2 } from "lucide-react";

/** Profile tab — account identity, sign out, and the danger zone. */
export function ProfileTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { preferences } = useUserPreferences();
  const language = preferences.language;

  const { data, isLoading } = useQuery(trpc.auth.getPreferences.queryOptions());

  const mutation = useMutation(
    trpc.auth.updateProfile.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(trpc.auth.getPreferences.queryOptions());
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const [nameValue, setNameValue] = useState("");
  const [nameSaving, setNameSaving] = useState(false);

  useEffect(() => {
    if (data?.name != null) setNameValue(data.name);
  }, [data?.name]);

  async function handleSaveName() {
    if (nameValue === data?.name) return;
    setNameSaving(true);
    try {
      await mutation.mutateAsync({ name: nameValue });
      toast.success(t(language, "common.saved"));
    } finally {
      setNameSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t(language, "settings.profile")}</CardTitle>
          <CardDescription>{t(language, "settings.profileDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            {data?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.image}
                alt={data.name ?? ""}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-xl font-semibold text-muted-foreground">
                {data?.name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t(language, "settings.avatarNote")}</p>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="displayName">{t(language, "settings.editName")}</Label>
            <div className="flex gap-2">
              <Input
                id="displayName"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                placeholder="Your name"
                className="flex-1"
              />
              {nameValue !== (data?.name ?? "") && (
                <Button onClick={handleSaveName} disabled={nameSaving} size="sm">
                  {nameSaving ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                      {t(language, "common.saving")}
                    </>
                  ) : (
                    t(language, "common.save")
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Email (read-only) */}
          <div className="space-y-2">
            <Label htmlFor="email">{t(language, "settings.emailReadOnly")}</Label>
            <Input
              id="email"
              value={data?.email ?? ""}
              readOnly
              disabled
              className="bg-muted text-muted-foreground"
            />
          </div>

          {/* Sign Out */}
          <Button variant="outline" onClick={() => signOut({ callbackUrl: "/login" })}>
            {t(language, "nav.signOut")}
          </Button>
        </CardContent>
      </Card>

      <DangerZone userEmail={data?.email ?? ""} />
    </div>
  );
}
