import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { Providers } from "@/components/layout/providers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Check household membership
  const membership = await prisma.householdMember.findFirst({
    where: { userId: session.user.id, inviteStatus: "ACCEPTED" },
  });

  // Check for pending invite
  const pendingInvite = await prisma.householdMember.findFirst({
    where: { userId: session.user.id, inviteStatus: "PENDING" },
  });

  return (
    <Providers>
      <div className="min-h-screen">
        <AppSidebar />
        <div className="md:pl-64">
          <AppHeader
            userName={session.user.name}
            userImage={session.user.image}
          />
          <main className="p-4 md:p-6 lg:p-8">
            {!membership && !pendingInvite ? (
              <HouseholdSetupBanner />
            ) : pendingInvite && !membership ? (
              <PendingInviteBanner />
            ) : null}
            {children}
          </main>
        </div>
      </div>
    </Providers>
  );
}

function HouseholdSetupBanner() {
  return (
    <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
      <h3 className="font-semibold text-blue-900 dark:text-blue-100">
        Welcome! Set up your household first
      </h3>
      <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
        Create a household to start tracking your finances. Go to{" "}
        <a href="/household" className="underline font-medium">
          Household Settings
        </a>{" "}
        to get started.
      </p>
    </div>
  );
}

function PendingInviteBanner() {
  return (
    <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950">
      <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">
        You have a pending household invitation
      </h3>
      <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
        Go to{" "}
        <a href="/household" className="underline font-medium">
          Household Settings
        </a>{" "}
        to accept or reject the invitation.
      </p>
    </div>
  );
}
