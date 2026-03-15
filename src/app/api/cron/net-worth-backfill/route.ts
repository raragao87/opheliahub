import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { backfillNetWorthSnapshots } from "@/lib/finance/net-worth-snapshot";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const secret = process.env.OPHELIA_CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const monthsBack: number = body.monthsBack ?? 12;

  const memberships = await prisma.householdMember.findMany({
    where: { inviteStatus: "ACCEPTED" },
    select: { householdId: true, userId: true },
  });

  let total = 0;
  const errors: string[] = [];

  for (const { householdId, userId } of memberships) {
    for (const visibility of ["SHARED", "PERSONAL"] as const) {
      try {
        const created = await backfillNetWorthSnapshots(
          prisma, householdId, userId, visibility, monthsBack
        );
        total += created;
      } catch (err) {
        errors.push(`${householdId}/${userId}/${visibility}: ${String(err)}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    created: total,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString(),
  });
}
