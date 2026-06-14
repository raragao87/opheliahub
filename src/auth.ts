import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { DEMO_USER_ID } from "@/lib/demo/constants";
import authConfig from "./auth.config";

// Public "Try the demo" login. Defined here (Node, not the edge auth.config) so
// the Prisma lookup never bloats the edge middleware bundle. Passwordless, but it
// can ONLY ever authenticate the fixed demo user, which lives solely in the demo
// household — so it grants no access to real user data.
const demoProvider = Credentials({
  id: "demo",
  name: "Demo",
  credentials: {},
  async authorize() {
    const user = await prisma.user.findUnique({ where: { id: DEMO_USER_ID } });
    if (!user) return null;
    return { id: user.id, email: user.email, name: user.name };
  },
});

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
  providers: [...authConfig.providers, demoProvider],
});
