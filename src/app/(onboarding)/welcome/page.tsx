"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Home,
  Mail,
  ArrowRight,
  Check,
  X,
  ChevronLeft,
  Loader2,
  LogOut,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { t, type Language } from "@/lib/translations";
import { useUserPreferences } from "@/lib/user-preferences-context";

const LANGUAGE_OPTIONS: { code: Language; flag: string; label: string }[] = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "pt", flag: "🇵🇹", label: "Português" },
  { code: "ro", flag: "🇷🇴", label: "Română" },
  { code: "nl", flag: "🇳🇱", label: "Nederlands" },
];

type Step =
  | "language"
  | "choose"
  | "create"
  | "create-success"
  | "join"
  | "join-no-invite";

function UserAvatar({ src, name, size = 64 }: { src?: string | null; name?: string | null; size?: number }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? "You"}
        width={size}
        height={size}
        className="rounded-full ring-2 ring-primary/30"
        referrerPolicy="no-referrer"
      />
    );
  }
  const initials = (name ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-full bg-primary/20 flex items-center justify-center ring-2 ring-primary/30"
      style={{ width: size, height: size }}
    >
      <span className="text-primary font-bold" style={{ fontSize: size * 0.35 }}>
        {initials}
      </span>
    </div>
  );
}

export default function WelcomePage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { preferences } = useUserPreferences();
  const lang = preferences.language;

  const [step, setStep] = useState<Step>("language");
  const [householdName, setHouseholdName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [createError, setCreateError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSent, setInviteSent] = useState(false);
  const [createdHouseholdId, setCreatedHouseholdId] = useState("");

  const sessionQuery = useQuery(trpc.auth.getSession.queryOptions());
  const user = sessionQuery.data?.user;

  const pendingInviteQuery = useQuery({
    ...trpc.household.getPendingInviteInfo.queryOptions(),
    enabled: step === "join",
  });

  const createMutation = useMutation(
    trpc.household.create.mutationOptions({
      onSuccess: (data) => {
        setCreatedHouseholdId(data.id);
        queryClient.invalidateQueries();
        setStep("create-success");
        setCreateError("");
      },
      onError: (err) => setCreateError(err.message),
    })
  );

  const inviteMutation = useMutation(
    trpc.household.invite.mutationOptions({
      onSuccess: () => {
        setInviteSent(true);
        setInviteError("");
      },
      onError: (err) => setInviteError(err.message),
    })
  );

  const acceptMutation = useMutation(
    trpc.household.acceptInvite.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        window.location.href = "/dashboard";
      },
    })
  );

  const rejectMutation = useMutation(
    trpc.household.rejectInvite.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        setStep("join-no-invite");
      },
    })
  );

  const languageMutation = useMutation(
    trpc.auth.updateProfile.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.auth.getPreferences.queryKey() });
        setStep("choose");
      },
    })
  );

  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between pt-10 pb-4 px-6">
        <div className="w-20" />
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-ambient">
            <span className="text-primary-foreground font-bold text-sm">OH</span>
          </div>
          <span className="text-xl font-display font-bold text-foreground tracking-tight">OpheliaHub</span>
        </div>
        <div className="w-20 flex justify-end">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg">
          {/* Back button */}
          {step !== "language" && step !== "choose" && step !== "create-success" && (
            <button
              onClick={() => setStep("choose")}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              {t(lang, "onboarding.back")}
            </button>
          )}

          {/* STEP: language */}
          {step === "language" && (
            <div className="space-y-8">
              <div className="text-center space-y-3">
                <h1 className="text-2xl font-display font-bold text-foreground">
                  Choose your language
                </h1>
                <p className="text-muted-foreground text-sm">
                  Select the language you&apos;d like to use in OpheliaHub.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {LANGUAGE_OPTIONS.map((option) => (
                  <button
                    key={option.code}
                    onClick={() => languageMutation.mutate({ language: option.code })}
                    disabled={languageMutation.isPending}
                    className="group relative rounded-xl bg-surface-container-low border border-outline-variant p-5 flex flex-col items-center gap-3 transition-all hover:bg-surface-container hover:border-primary/40 hover:shadow-[0_0_20px_rgba(165,180,252,0.1)] active:scale-[0.98]"
                  >
                    <span className="text-4xl">{option.flag}</span>
                    <span className="font-display font-semibold text-foreground text-sm">
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP: choose */}
          {step === "choose" && (
            <div className="space-y-6">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <UserAvatar src={user?.image} name={user?.name} size={72} />
                </div>
                <div>
                  <h1 className="text-2xl font-display font-bold text-foreground">
                    {firstName
                      ? t(lang, "onboarding.welcomeName").replace("{name}", firstName)
                      : t(lang, "onboarding.welcome")}
                  </h1>
                  <p className="text-muted-foreground mt-1.5 text-sm">
                    {t(lang, "onboarding.setupDesc")}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => setStep("create")}
                  className="w-full text-left group"
                >
                  <div className="rounded-xl bg-surface-container-low border border-outline-variant p-5 flex items-start gap-4 transition-all group-hover:bg-surface-container group-hover:border-primary/40 group-hover:shadow-[0_0_20px_rgba(165,180,252,0.1)]">
                    <div className="h-11 w-11 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/25 transition-colors">
                      <Home className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">
                        {t(lang, "onboarding.createHousehold")}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {t(lang, "onboarding.createHouseholdDesc")}
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-0.5" />
                  </div>
                </button>

                <button
                  onClick={() => setStep("join")}
                  className="w-full text-left group"
                >
                  <div className="rounded-xl bg-surface-container-low border border-outline-variant p-5 flex items-start gap-4 transition-all group-hover:bg-surface-container group-hover:border-primary/40 group-hover:shadow-[0_0_20px_rgba(165,180,252,0.1)]">
                    <div className="h-11 w-11 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/25 transition-colors">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">
                        {t(lang, "onboarding.iWasInvited")}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {t(lang, "onboarding.iWasInvitedDesc")}
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-0.5" />
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* STEP: create */}
          {step === "create" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-display font-bold text-foreground">
                  {t(lang, "onboarding.createYourHousehold")}
                </h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t(lang, "onboarding.createHouseholdNameDesc")}
                </p>
              </div>

              <div className="rounded-xl bg-surface-container-low border border-outline-variant p-6">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (householdName.trim()) {
                      createMutation.mutate({ name: householdName.trim() });
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="householdName" className="text-foreground">
                      {t(lang, "household.householdName")}
                    </Label>
                    <Input
                      id="householdName"
                      placeholder="e.g., The Johnson Family"
                      value={householdName}
                      onChange={(e) => setHouseholdName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  {createError && (
                    <p className="text-sm text-destructive-foreground">{createError}</p>
                  )}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!householdName.trim() || createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t(lang, "household.creating")}
                      </>
                    ) : (
                      <>
                        {t(lang, "household.createBtn")}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </form>
              </div>
            </div>
          )}

          {/* STEP: create-success */}
          {step === "create-success" && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="h-14 w-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
                  <Check className="h-7 w-7 text-emerald-400" />
                </div>
                <h1 className="text-2xl font-display font-bold text-foreground">
                  {t(lang, "onboarding.householdCreated")}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {t(lang, "onboarding.householdReady").replace("{name}", householdName)}
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl bg-surface-container-low border border-outline-variant p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                      <Mail className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">
                        {t(lang, "onboarding.invitePartner")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t(lang, "onboarding.invitePartnerDesc")}
                      </p>
                    </div>
                  </div>
                  {inviteSent ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-300 bg-emerald-500/10 rounded-lg px-3 py-2 border border-emerald-500/20">
                      <Check className="h-4 w-4" />
                      {t(lang, "onboarding.inviteSent")}
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (inviteEmail.trim()) {
                          inviteMutation.mutate({ email: inviteEmail.trim() });
                        }
                      }}
                      className="flex gap-2"
                    >
                      <Input
                        type="email"
                        placeholder={t(lang, "household.invitePlaceholder")}
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="submit"
                        disabled={!inviteEmail.trim() || inviteMutation.isPending}
                      >
                        {inviteMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          t(lang, "household.invite")
                        )}
                      </Button>
                    </form>
                  )}
                  {inviteError && (
                    <p className="text-sm text-destructive-foreground">{inviteError}</p>
                  )}
                </div>

                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground hover:text-foreground"
                  onClick={() => { window.location.href = "/dashboard"; }}
                >
                  {t(lang, "onboarding.skipToDashboard")}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP: join */}
          {step === "join" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-display font-bold text-foreground">
                  {t(lang, "onboarding.checkInvitation")}
                </h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t(lang, "onboarding.lookingForInvite")}{" "}
                  <span className="font-medium text-foreground">{user?.email}</span>...
                </p>
              </div>

              {pendingInviteQuery.isLoading ? (
                <div className="rounded-xl bg-surface-container-low border border-outline-variant p-8 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : pendingInviteQuery.data ? (
                <div className="rounded-xl bg-surface-container-low border border-primary/30 p-6 space-y-4">
                  <div className="flex items-center gap-4">
                    <UserAvatar
                      src={pendingInviteQuery.data.invitedByImage}
                      name={pendingInviteQuery.data.invitedByName}
                      size={48}
                    />
                    <div>
                      <p className="font-semibold text-foreground">
                        {pendingInviteQuery.data.invitedByName} {t(lang, "onboarding.invitedYou")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t(lang, "onboarding.toJoin")}{" "}
                        <span className="font-medium text-foreground">
                          {pendingInviteQuery.data.householdName}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      className="flex-1"
                      onClick={() => acceptMutation.mutate()}
                      disabled={acceptMutation.isPending || rejectMutation.isPending}
                    >
                      {acceptMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          {t(lang, "onboarding.acceptAndJoin")}
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => rejectMutation.mutate()}
                      disabled={acceptMutation.isPending || rejectMutation.isPending}
                    >
                      {rejectMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <X className="h-4 w-4 mr-1" />
                          {t(lang, "onboarding.decline")}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl bg-surface-container-low border border-outline-variant p-6 text-center space-y-2">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground">
                      {t(lang, "onboarding.noInvitation")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t(lang, "onboarding.askPartnerToInvite")}{" "}
                      <span className="font-medium text-foreground">
                        {user?.email}
                      </span>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground hover:text-foreground"
                    onClick={() => setStep("choose")}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    {t(lang, "onboarding.createInstead")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6">
        <p className="text-xs text-muted-foreground">
          OpheliaHub &mdash; Personal &amp; Family Finance
        </p>
      </footer>
    </div>
  );
}
