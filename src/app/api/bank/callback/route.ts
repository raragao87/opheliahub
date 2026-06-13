import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { verifyState } from "@/lib/bank/state";
import { createSession, getAccountDetails } from "@/lib/bank/enable-banking";

export const runtime = "nodejs";

/**
 * Enable Banking redirects the user here after they consent at their bank.
 * This route is public in middleware (the user arrives via a top-level GET),
 * but we validate the HMAC-signed state independent of the session cookie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");
  const settingsUrl = new URL("/settings?tab=banks", url.origin);

  if (url.searchParams.get("error") || !code || !stateToken) {
    settingsUrl.searchParams.set("error", "connect_failed");
    return NextResponse.redirect(settingsUrl);
  }

  const state = verifyState(stateToken);
  if (!state) {
    settingsUrl.searchParams.set("error", "connect_failed");
    return NextResponse.redirect(settingsUrl);
  }

  // Defense in depth: if a session is resolvable, it must match the state user.
  const session = await auth();
  if (session?.user?.id && session.user.id !== state.userId) {
    settingsUrl.searchParams.set("error", "connect_failed");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const ebSession = await createSession(code);

    // Capture the discovered accounts now (drives the mapping UI).
    const discovered = await Promise.all(
      ebSession.accounts.map(async (uid) => {
        try {
          const d = await getAccountDetails(uid);
          return { uid, name: d.name, iban: d.iban, currency: d.currency };
        } catch {
          return { uid };
        }
      })
    );

    const connection = await prisma.bankConnection.create({
      data: {
        userId: state.userId,
        aspspName: state.aspspName,
        aspspCountry: state.aspspCountry,
        sessionId: ebSession.session_id,
        discoveredAccounts: discovered,
        status: "ACTIVE",
        consentValidUntil: new Date(state.validUntil),
      },
    });

    settingsUrl.searchParams.set("connected", connection.id);
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    console.error("[Bank] callback error:", err);
    settingsUrl.searchParams.set("error", "connect_failed");
    return NextResponse.redirect(settingsUrl);
  }
}
