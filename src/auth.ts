import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import authConfig from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      // Link any pending email invites to the newly signed-in user
      if (user.id && user.email) {
        const pending = await prisma.pendingInvite.findFirst({
          where: { email: user.email },
        });
        if (pending) {
          // Check they're not already a member
          const alreadyMember = await prisma.householdMember.findFirst({
            where: { householdId: pending.householdId, userId: user.id },
          });
          if (!alreadyMember) {
            await prisma.householdMember.create({
              data: {
                householdId: pending.householdId,
                userId: user.id,
                role: "PARTNER",
                inviteStatus: "PENDING",
                inviteEmail: user.email,
              },
            });
          }
          await prisma.pendingInvite.delete({ where: { id: pending.id } });
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  ...authConfig,
});
