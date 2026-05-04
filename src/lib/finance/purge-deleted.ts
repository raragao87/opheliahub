import type { PrismaClient } from "@prisma/client";

export async function purgeDeletedRecords(
  prisma: PrismaClient,
  retentionDays: number = 90
): Promise<{ transactions: number; accounts: number }> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const txResult = await prisma.transaction.deleteMany({
    where: {
      deletedAt: { not: null, lte: cutoff },
    },
  });

  const acctResult = await prisma.financialAccount.deleteMany({
    where: {
      deletedAt: { not: null, lte: cutoff },
      transactions: { none: {} },
    },
  });

  return {
    transactions: txResult.count,
    accounts: acctResult.count,
  };
}
