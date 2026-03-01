import { NextResponse } from "next/server";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { categorizeTransactionBatch } from "@/lib/ophelia/categorize-batch";

/**
 * POST /api/ophelia/categorize
 *
 * Cron / webhook endpoint that runs Ophelia background categorization for
 * ALL households with unprocessed transactions.
 *
 * Protected by the `OPHELIA_CRON_SECRET` environment variable.
 * Set the Authorization header to: Bearer <OPHELIA_CRON_SECRET>
 *
 * Returns 200 with { skipped: true } when Ophelia is disabled.
 * Returns 200 with { processed, skipped, errors } on success.
 * Returns 401 when the secret is missing or incorrect.
 */
export async function POST(req: Request) {
  // Verify the cron secret.
  // Accepts OPHELIA_CRON_SECRET (explicit) or CRON_SECRET (Vercel auto-injects
  // this for cron jobs and sends it as "Authorization: Bearer <CRON_SECRET>").
  const secret = env.OPHELIA_CRON_SECRET ?? process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const provided = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env.OPHELIA_ENABLED) {
    return NextResponse.json({ skipped: true });
  }

  try {
    // Process all households — no householdId scoping for the cron
    const result = await categorizeTransactionBatch(prisma);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[Ophelia] Cron categorization failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
