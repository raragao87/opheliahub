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

  // Only users with an accepted household see the full app layout
  const membership = await prisma.householdMember.findFirst({
    where: { userId: session.user.id, inviteStatus: "ACCEPTED" },
  });

  if (!membership) {
    redirect("/welcome");
  }

  return (
    <Providers>
      <div className="min-h-screen">
        <AppSidebar />
        <div className="md:pl-64">
          <AppHeader
            userName={session.user.name}
            userImage={session.user.image}
            userEmail={session.user.email}
          />
          <main className="p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>

    </Providers>
  );
}
