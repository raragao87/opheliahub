import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DEMO_USER_ID } from "@/lib/demo/constants";

const providers: NextAuthConfig["providers"] = [
  Google({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
  }),
  // Public "Try the demo" login. Passwordless, but it can ONLY ever authenticate
  // the fixed demo user, which lives solely in the demo household — so it grants
  // no access to real user data. Enabled in production on purpose.
  Credentials({
    id: "demo",
    name: "Demo",
    credentials: {},
    async authorize() {
      const { prisma } = await import("@/lib/prisma");
      const user = await prisma.user.findUnique({ where: { id: DEMO_USER_ID } });
      if (!user) return null;
      return { id: user.id, email: user.email, name: user.name };
    },
  }),
];

if (process.env.NODE_ENV === "development") {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Dev Login",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        if (!email) return null;
        const { prisma } = await import("@/lib/prisma");
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    })
  );
}

export default {
  providers,
  pages: {
    signIn: "/login",
    error: "/login",
  },
} satisfies NextAuthConfig;
