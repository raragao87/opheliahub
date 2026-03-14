import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Providers } from "@/components/layout/providers";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Already has an accepted household → go to the app
  const membership = await prisma.householdMember.findFirst({
    where: { userId: session.user.id, inviteStatus: "ACCEPTED" },
  });

  if (membership) {
    redirect("/dashboard");
  }

  return <Providers>{children}</Providers>;
}
