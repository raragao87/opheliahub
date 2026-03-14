"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Home,
  Mail,
  ArrowRight,
  Check,
  X,
  ChevronLeft,
  Loader2,
} from "lucide-react";

type Step =
  | "choose"
  | "create"
  | "create-success"
  | "join"
  | "join-no-invite";

export default function WelcomePage() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("choose");
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
        router.push("/dashboard");
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-center pt-8 pb-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shadow-sm">
            <span className="text-primary-foreground font-bold text-sm">OH</span>
          </div>
          <span className="text-xl font-semibold text-slate-800">OpheliaHub</span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg">
          {/* Back button (except on choose step) */}
          {step !== "choose" && step !== "create-success" && (
            <button
              onClick={() => setStep("choose")}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          )}

          {/* STEP: choose */}
          {step === "choose" && (
            <div className="space-y-6">
              {/* Greeting */}
              <div className="text-center space-y-3">
                {user?.image && (
                  <Image
                    src={user.image}
                    alt={user.name ?? "You"}
                    width={64}
                    height={64}
                    className="rounded-full mx-auto ring-2 ring-white shadow-md"
                  />
                )}
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">
                    Welcome to OpheliaHub
                    {user?.name ? `, ${user.name.split(" ")[0]}` : ""}!
                  </h1>
                  <p className="text-muted-foreground mt-1">
                    Let&apos;s get your household set up so you can start
                    tracking your finances together.
                  </p>
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <button
                  onClick={() => setStep("create")}
                  className="w-full text-left group"
                >
                  <Card className="border-2 border-transparent group-hover:border-primary/30 group-hover:bg-primary/5 transition-all cursor-pointer">
                    <CardContent className="p-5 flex items-start gap-4">
                      <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                        <Home className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900">
                          Create a household
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Start fresh. You&apos;ll be the owner and can invite
                          your partner later.
                        </p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-0.5" />
                    </CardContent>
                  </Card>
                </button>

                <button
                  onClick={() => setStep("join")}
                  className="w-full text-left group"
                >
                  <Card className="border-2 border-transparent group-hover:border-primary/30 group-hover:bg-primary/5 transition-all cursor-pointer">
                    <CardContent className="p-5 flex items-start gap-4">
                      <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                        <Mail className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900">
                          I was invited
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Your partner already set things up. Check for a
                          pending invitation.
                        </p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-0.5" />
                    </CardContent>
                  </Card>
                </button>
              </div>
            </div>
          )}

          {/* STEP: create */}
          {step === "create" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Create your household
                </h1>
                <p className="text-muted-foreground mt-1">
                  Give your household a name — you can always change it later.
                </p>
              </div>

              <Card>
                <CardContent className="p-6">
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
                      <Label htmlFor="householdName">Household name</Label>
                      <Input
                        id="householdName"
                        placeholder="e.g., The Johnson Family"
                        value={householdName}
                        onChange={(e) => setHouseholdName(e.target.value)}
                        autoFocus
                      />
                    </div>
                    {createError && (
                      <p className="text-sm text-red-600">{createError}</p>
                    )}
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={
                        !householdName.trim() || createMutation.isPending
                      }
                    >
                      {createMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          Create household
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}

          {/* STEP: create-success */}
          {step === "create-success" && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <Check className="h-7 w-7 text-green-600" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Household created!
                </h1>
                <p className="text-muted-foreground">
                  &ldquo;{householdName}&rdquo; is ready. Would you like to
                  invite your partner now?
                </p>
              </div>

              <div className="space-y-3">
                {/* Invite partner */}
                <Card>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Mail className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">
                          Invite your partner
                        </p>
                        <p className="text-xs text-muted-foreground">
                          They&apos;ll see a pending invite when they sign in.
                        </p>
                      </div>
                    </div>
                    {inviteSent ? (
                      <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">
                        <Check className="h-4 w-4" />
                        Invitation sent! They&apos;ll see it when they sign in.
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
                          placeholder="partner@email.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          type="submit"
                          disabled={
                            !inviteEmail.trim() || inviteMutation.isPending
                          }
                        >
                          {inviteMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Invite"
                          )}
                        </Button>
                      </form>
                    )}
                    {inviteError && (
                      <p className="text-sm text-red-600">{inviteError}</p>
                    )}
                  </CardContent>
                </Card>

                {/* Skip */}
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => router.push("/dashboard")}
                >
                  Skip for now, take me to the dashboard
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP: join */}
          {step === "join" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Check your invitation
                </h1>
                <p className="text-muted-foreground mt-1">
                  Looking for a pending invitation for{" "}
                  <span className="font-medium">{user?.email}</span>...
                </p>
              </div>

              {pendingInviteQuery.isLoading ? (
                <Card>
                  <CardContent className="p-8 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </CardContent>
                </Card>
              ) : pendingInviteQuery.data ? (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-4">
                      {pendingInviteQuery.data.invitedByImage && (
                        <Image
                          src={pendingInviteQuery.data.invitedByImage}
                          alt={pendingInviteQuery.data.invitedByName}
                          width={48}
                          height={48}
                          className="rounded-full ring-2 ring-white shadow-sm"
                        />
                      )}
                      <div>
                        <p className="font-semibold text-slate-900">
                          {pendingInviteQuery.data.invitedByName} invited you
                        </p>
                        <p className="text-sm text-muted-foreground">
                          to join{" "}
                          <span className="font-medium text-slate-700">
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
                            Accept &amp; join
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
                            Decline
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <Card>
                    <CardContent className="p-6 text-center space-y-2">
                      <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
                        <Mail className="h-5 w-5 text-slate-400" />
                      </div>
                      <p className="font-medium text-slate-900">
                        No invitation found
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Ask your partner to invite you using your email:{" "}
                        <span className="font-medium text-slate-700">
                          {user?.email}
                        </span>
                      </p>
                    </CardContent>
                  </Card>
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => setStep("choose")}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Create your own household instead
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
