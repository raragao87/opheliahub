import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncConnection } from "@/lib/bank/sync-connection";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily background sync of all ACTIVE bank connections. Auth mirrors the
 * Ophelia categorize cron: Bearer secret (PM2/manual POST) OR x-vercel-cron
 * header (Vercel cron uses GET). Both methods route through the same handler.
 */
async function handle(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const provided = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const secret = process.env.OPHELIA_CRON_SECRET;
  const isSecretCron = !!secret && provided === secret;
  const isVercelCron = !!process.env.VERCEL && !!request.headers.get("x-vercel-cron");

  if (!isSecretCron && !isVercelCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await prisma.bankConnection.findMany({
    where: { status: "ACTIVE" },
  });

  // Resolve each owner's household once (needed by the commit hooks).
  const memberships = await prisma.householdMember.findMany({
    where: { inviteStatus: "ACCEPTED" },
    select: { userId: true, householdId: true },
  });
  const householdByUser = new Map(memberships.map((m) => [m.userId, m.householdId]));

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const connection of connections) {
    const householdId = householdByUser.get(connection.userId);
    if (!householdId) continue;
    try {
      const r = await syncConnection(prisma, connection, householdId);
      imported += r.imported;
      skipped += r.skipped;
      if (r.errors.length > 0) errors.push(`${connection.aspspName}: ${r.errors.join("; ")}`);
    } catch (err) {
      errors.push(`${connection.aspspName}: ${String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    connections: connections.length,
    imported,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export const GET = handle;
export const POST = handle;
