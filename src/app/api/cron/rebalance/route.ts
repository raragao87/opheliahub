import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const secret = process.env.OPHELIA_CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.financialAccount.findMany({
    select: { id: true, name: true, balance: true, currency: true },
  });

  const fixed: { name: string; currency: string; old: number; new: number; diff: number }[] = [];

  for (const acct of accounts) {
    const agg = await prisma.transaction.aggregate({
      where: { accountId: acct.id, deletedAt: null },
      _sum: { amount: true },
    });
    const computed = agg._sum.amount ?? 0;
    if (computed !== acct.balance) {
      await prisma.financialAccount.update({
        where: { id: acct.id },
        data: { balance: computed },
      });
      fixed.push({
        name: acct.name,
        currency: acct.currency,
        old: acct.balance,
        new: computed,
        diff: computed - acct.balance,
      });
    }
  }

  return NextResponse.json({ checked: accounts.length, fixed });
}
