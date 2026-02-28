"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Users, Mail, Check, X } from "lucide-react";

export default function HouseholdPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const sessionQuery = useQuery(trpc.auth.getSession.queryOptions());
  const session = sessionQuery.data;

  if (sessionQuery.isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (!session?.household) {
    return <CreateHouseholdView />;
  }

  return <HouseholdManageView />;
}

function CreateHouseholdView() {
  const [name, setName] = useState("");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();

  const createMutation = useMutation(
    trpc.household.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        router.refresh(); // Refresh server components (layout banner)
      },
    })
  );

  // Check for pending invite
  const acceptMutation = useMutation(
    trpc.household.acceptInvite.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        router.refresh();
      },
    })
  );

  const rejectMutation = useMutation(
    trpc.household.rejectInvite.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        router.refresh();
      },
    })
  );

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Set Up Your Household</h1>

      <Card>
        <CardHeader>
          <CardTitle>Create a Household</CardTitle>
          <CardDescription>
            Create a household to start managing your finances together.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) createMutation.mutate({ name: name.trim() });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="name">Household Name</Label>
              <Input
                id="name"
                placeholder="e.g., The Johnson Family"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={!name.trim() || createMutation.isPending}
              className="w-full"
            >
              {createMutation.isPending ? "Creating..." : "Create Household"}
            </Button>
            {createMutation.error && (
              <p className="text-sm text-red-600">{createMutation.error.message}</p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending Invitation?</CardTitle>
          <CardDescription>
            If your partner has invited you, accept the invitation here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button
            onClick={() => acceptMutation.mutate()}
            disabled={acceptMutation.isPending}
            className="flex-1"
          >
            <Check className="h-4 w-4 mr-1" />
            Accept Invite
          </Button>
          <Button
            variant="outline"
            onClick={() => rejectMutation.mutate()}
            disabled={rejectMutation.isPending}
            className="flex-1"
          >
            <X className="h-4 w-4 mr-1" />
            Reject
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function HouseholdManageView() {
  const [email, setEmail] = useState("");
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const householdQuery = useQuery(trpc.household.get.queryOptions());
  const household = householdQuery.data;

  const inviteMutation = useMutation(
    trpc.household.invite.mutationOptions({
      onSuccess: () => {
        setEmail("");
        queryClient.invalidateQueries();
      },
    })
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Household</h1>

      <Card>
        <CardHeader>
          <CardTitle>{household?.name ?? "Loading..."}</CardTitle>
          <CardDescription>Manage your household members and settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Members */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Members</h3>
            <div className="space-y-3">
              {household?.members.map((member) => (
                <div key={member.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {member.user.image && (
                      <img
                        src={member.user.image}
                        alt={member.user.name ?? ""}
                        className="h-8 w-8 rounded-full"
                      />
                    )}
                    <div>
                      <p className="text-sm font-medium">{member.user.name}</p>
                      <p className="text-xs text-muted-foreground">{member.user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{member.role}</Badge>
                    <Badge
                      variant={
                        member.inviteStatus === "ACCEPTED"
                          ? "default"
                          : member.inviteStatus === "PENDING"
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {member.inviteStatus}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Invite */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Invite Partner</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) inviteMutation.mutate({ email: email.trim() });
              }}
              className="flex gap-2"
            >
              <Input
                type="email"
                placeholder="partner@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={!email.trim() || inviteMutation.isPending}>
                <Mail className="h-4 w-4 mr-1" />
                Invite
              </Button>
            </form>
            {inviteMutation.error && (
              <p className="text-sm text-red-600 mt-2">{inviteMutation.error.message}</p>
            )}
            {inviteMutation.isSuccess && (
              <p className="text-sm text-green-600 mt-2">Invitation sent!</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
