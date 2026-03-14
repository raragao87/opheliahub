import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { captureNetWorthSnapshot } from "@/lib/finance/net-worth-snapshot";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  // Verify Bearer token
  const authHeader = request.headers.get("Authorization");
  const secret = process.env.OPHELIA_CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Fetch all accepted household memberships
  const memberships = await prisma.householdMember.findMany({
    where: { inviteStatus: "ACCEPTED" },
    select: { householdId: true, userId: true },
  });

  let captured = 0;
  const errors: string[] = [];

  for (const { householdId, userId } of memberships) {
    for (const visibility of ["SHARED", "PERSONAL"] as const) {
      try {
        await captureNetWorthSnapshot(prisma, householdId, userId, visibility, year, month);
        captured++;
      } catch (err) {
        errors.push(`${householdId}/${userId}/${visibility}: ${String(err)}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    captured,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: now.toISOString(),
  });
}
