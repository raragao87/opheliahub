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
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Pencil,
  Trash2,
  UserMinus,
  ArrowRightLeft,
  Mail,
  Check,
  X,
  Users,
} from "lucide-react";

export default function HouseholdPage() {
  const trpc = useTRPC();

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
    <div className="max-w-2xl mx-auto space-y-6">
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
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  // Confirmation dialog state
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [transferTarget, setTransferTarget] = useState<{ id: string; name: string } | null>(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();

  const householdQuery = useQuery(trpc.household.get.queryOptions());
  const household = householdQuery.data;

  const sessionQuery = useQuery(trpc.auth.getSession.queryOptions());
  const session = sessionQuery.data;

  const isOwner = session?.householdRole === "OWNER";
  const currentUserId = session?.user?.id;

  // Mutations
  const updateMutation = useMutation(
    trpc.household.update.mutationOptions({
      onSuccess: () => {
        setEditingName(false);
        queryClient.invalidateQueries();
        toast.success("Household name updated.");
      },
      onError: (err) => {
        toast.error(err.message);
      },
    })
  );

  const inviteMutation = useMutation(
    trpc.household.invite.mutationOptions({
      onSuccess: () => {
        setEmail("");
        queryClient.invalidateQueries();
        toast.success("Invitation sent!");
      },
      onError: (err) => {
        toast.error(err.message);
      },
    })
  );

  const removeMutation = useMutation(
    trpc.household.removeMember.mutationOptions({
      onSuccess: () => {
        setRemoveTarget(null);
        queryClient.invalidateQueries();
        toast.success("Member removed.");
      },
      onError: (err) => {
        toast.error(err.message);
      },
    })
  );

  const transferMutation = useMutation(
    trpc.household.transferOwnership.mutationOptions({
      onSuccess: () => {
        setTransferTarget(null);
        queryClient.invalidateQueries();
        toast.success("Ownership transferred.");
      },
      onError: (err) => {
        toast.error(err.message);
      },
    })
  );

  const leaveMutation = useMutation(
    trpc.household.leave.mutationOptions({
      onSuccess: () => {
        setShowLeaveDialog(false);
        queryClient.invalidateQueries();
        router.push("/welcome");
      },
      onError: (err) => {
        toast.error(err.message);
      },
    })
  );

  function startEditName() {
    setNameInput(household?.name ?? "");
    setEditingName(true);
  }

  function cancelEditName() {
    setEditingName(false);
    setNameInput("");
  }

  function saveName() {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== household?.name) {
      updateMutation.mutate({ name: trimmed });
    } else {
      setEditingName(false);
    }
  }

  function getMemberLabel(member: {
    role: string;
    inviteStatus: string;
    joinedAt: Date | null;
  }): React.ReactNode {
    if (member.inviteStatus === "PENDING") {
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
          Pending invite
        </Badge>
      );
    }
    const roleLabel = member.role === "OWNER" ? "Owner" : "Member";
    const since = member.joinedAt
      ? new Date(member.joinedAt).toLocaleDateString("en-GB", {
          month: "short",
          year: "numeric",
        })
      : null;
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          {roleLabel}
        </Badge>
        {since && (
          <span className="text-xs text-muted-foreground">Member since {since}</span>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Users className="h-7 w-7 text-primary" />
        <div className="flex items-center gap-2">
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="text-2xl font-bold h-auto py-1 px-2 w-64"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") cancelEditName();
                }}
                autoFocus
              />
              <Button
                size="sm"
                onClick={saveName}
                disabled={updateMutation.isPending}
              >
                <Check className="h-4 w-4" />
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEditName}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-bold">{household?.name ?? "Loading..."}</h1>
              {isOwner && (
                <button
                  onClick={startEditName}
                  className="text-muted-foreground hover:text-foreground transition-colors ml-1"
                  aria-label="Edit household name"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Members Card */}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>People who are part of your household.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {household?.members.map((member) => {
            const isCurrentUser = member.user.id === currentUserId;
            const isAccepted = member.inviteStatus === "ACCEPTED";
            const isPending = member.inviteStatus === "PENDING";
            const memberName = member.user.name ?? member.inviteEmail ?? "Unknown";

            return (
              <div
                key={member.id}
                className="flex items-center justify-between py-2 border-b last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  {member.user.image ? (
                    <img
                      src={member.user.image}
                      alt={memberName}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                      {memberName.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Info */}
                  <div>
                    <p className="text-sm font-medium">
                      {memberName}
                      {isCurrentUser && (
                        <span className="text-muted-foreground font-normal ml-1">(you)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{member.user.email}</p>
                    <div className="mt-1">{getMemberLabel(member)}</div>
                  </div>
                </div>

                {/* Actions — only for owner acting on other members */}
                {isOwner && !isCurrentUser && (
                  <div className="flex items-center gap-2">
                    {isAccepted && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setTransferTarget({ id: member.user.id, name: memberName })
                          }
                        >
                          <ArrowRightLeft className="h-3 w-3 mr-1" />
                          Transfer ownership
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() =>
                            setRemoveTarget({ id: member.user.id, name: memberName })
                          }
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Remove
                        </Button>
                      </>
                    )}
                    {isPending && (
                      <span className="text-xs text-muted-foreground">Waiting</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Invite Card — owner only */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Invite Someone</CardTitle>
            <CardDescription>
              Invite someone to join your household. They'll need to sign in with this Google account.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                {inviteMutation.isPending ? "Sending..." : "Invite"}
              </Button>
            </form>
            {inviteMutation.error && (
              <p className="text-sm text-red-600 mt-2">{inviteMutation.error.message}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Leave Household — non-owners only */}
      {!isOwner && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-700">Leave Household</CardTitle>
            <CardDescription>
              Once you leave, you'll lose access to all shared data. Your personal accounts and
              transactions are unaffected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => setShowLeaveDialog(true)}
            >
              <UserMinus className="h-4 w-4 mr-2" />
              Leave Household
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Remove Member Dialog */}
      <Dialog open={!!removeTarget} onClose={() => setRemoveTarget(null)}>
        <DialogHeader onClose={() => setRemoveTarget(null)}>
          <DialogTitle>Remove {removeTarget?.name}?</DialogTitle>
          <DialogDescription>
            Remove {removeTarget?.name} from this household? They will lose access to all shared
            data. Their personal data is unaffected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRemoveTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={removeMutation.isPending}
            onClick={() => {
              if (removeTarget) removeMutation.mutate({ userId: removeTarget.id });
            }}
          >
            {removeMutation.isPending ? "Removing..." : "Remove"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Transfer Ownership Dialog */}
      <Dialog open={!!transferTarget} onClose={() => setTransferTarget(null)}>
        <DialogHeader onClose={() => setTransferTarget(null)}>
          <DialogTitle>Transfer ownership to {transferTarget?.name}?</DialogTitle>
          <DialogDescription>
            You will become a regular member and {transferTarget?.name} will be the new owner.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setTransferTarget(null)}>
            Cancel
          </Button>
          <Button
            disabled={transferMutation.isPending}
            onClick={() => {
              if (transferTarget) transferMutation.mutate({ newOwnerId: transferTarget.id });
            }}
          >
            {transferMutation.isPending ? "Transferring..." : "Transfer"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Leave Household Dialog */}
      <Dialog open={showLeaveDialog} onClose={() => setShowLeaveDialog(false)}>
        <DialogHeader onClose={() => setShowLeaveDialog(false)}>
          <DialogTitle>Leave {household?.name}?</DialogTitle>
          <DialogDescription>
            You will lose access to all shared data. Your personal accounts and transactions are
            unaffected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={leaveMutation.isPending}
            onClick={() => leaveMutation.mutate()}
          >
            {leaveMutation.isPending ? "Leaving..." : "Leave"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
