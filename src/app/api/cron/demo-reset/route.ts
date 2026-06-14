import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { seedDemoHousehold } from "@/lib/demo/seed-demo";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily reset of the public demo household to its seeded state. Auth mirrors the
 * other crons: Bearer OPHELIA_CRON_SECRET (manual/PM2 POST) OR x-vercel-cron (GET).
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

  const result = await seedDemoHousehold(prisma);
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
