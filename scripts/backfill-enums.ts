/**
 * Phase 3: Convert free strings → enums, Float → Int.
 * Run BEFORE prisma db push.
 * Usage: npx tsx scripts/backfill-enums.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── Float → Int value conversions (must happen before type change) ──

  // opheliaConfidence: 0.0–1.0 → 0–1000
  const confResult = await prisma.$executeRawUnsafe(`
    UPDATE transactions
    SET "opheliaConfidence" = ROUND("opheliaConfidence" * 1000)
    WHERE "opheliaConfidence" IS NOT NULL
  `);
  console.log(`Updated ${confResult} opheliaConfidence values to milli-confidence`);

  // interestRate: percentage → basis points (4.25 → 425)
  const rateResult = await prisma.$executeRawUnsafe(`
    UPDATE debts
    SET "interestRate" = ROUND("interestRate" * 100)
    WHERE "interestRate" IS NOT NULL
  `);
  console.log(`Updated ${rateResult} interestRate values to basis points`);

  // DuplicateAlert confidence: 0.0–1.0 → 0–1000
  const dupResult = await prisma.$executeRawUnsafe(`
    UPDATE duplicate_alerts
    SET confidence = ROUND(confidence * 1000)
  `);
  console.log(`Updated ${dupResult} duplicate alert confidence values`);

  // ── Float → Int type changes ──

  await prisma.$executeRawUnsafe(`
    ALTER TABLE transactions
    ALTER COLUMN "opheliaConfidence" TYPE INTEGER USING "opheliaConfidence"::INTEGER
  `);
  console.log("Changed opheliaConfidence to INTEGER");

  await prisma.$executeRawUnsafe(`
    ALTER TABLE debts
    ALTER COLUMN "interestRate" TYPE INTEGER USING "interestRate"::INTEGER
  `);
  console.log("Changed interestRate to INTEGER");

  await prisma.$executeRawUnsafe(`
    ALTER TABLE duplicate_alerts
    ALTER COLUMN confidence TYPE INTEGER USING confidence::INTEGER
  `);
  console.log("Changed confidence to INTEGER");

  // ── String → Enum conversions ──

  // Feedback type
  await prisma.$executeRawUnsafe(`
    ALTER TABLE feedback
    ALTER COLUMN type TYPE "FeedbackType" USING UPPER(type)::"FeedbackType"
  `);
  console.log("Converted feedback.type to FeedbackType enum");

  // Feedback status
  await prisma.$executeRawUnsafe(`
    ALTER TABLE feedback
    ALTER COLUMN status TYPE "FeedbackStatus" USING UPPER(status)::"FeedbackStatus",
    ALTER COLUMN status SET DEFAULT 'NEW'::"FeedbackStatus"
  `);
  console.log("Converted feedback.status to FeedbackStatus enum");

  // DuplicateAlert status
  await prisma.$executeRawUnsafe(`
    ALTER TABLE duplicate_alerts
    ALTER COLUMN status TYPE "DuplicateAlertStatus" USING UPPER(status)::"DuplicateAlertStatus",
    ALTER COLUMN status SET DEFAULT 'PENDING'::"DuplicateAlertStatus"
  `);
  console.log("Converted duplicate_alerts.status to DuplicateAlertStatus enum");

  // ChatMessage role
  await prisma.$executeRawUnsafe(`
    ALTER TABLE chat_messages
    ALTER COLUMN role TYPE "ChatRole" USING UPPER(role)::"ChatRole"
  `);
  console.log("Converted chat_messages.role to ChatRole enum");

  // Asset category
  await prisma.$executeRawUnsafe(`
    ALTER TABLE assets
    ALTER COLUMN category TYPE "AssetCategory" USING UPPER(category)::"AssetCategory"
  `);
  console.log("Converted assets.category to AssetCategory enum");

  // ImportProfile amountMode
  await prisma.$executeRawUnsafe(`
    ALTER TABLE import_profiles
    ALTER COLUMN "amountMode" TYPE "AmountMode" USING UPPER("amountMode")::"AmountMode",
    ALTER COLUMN "amountMode" SET DEFAULT 'SINGLE'::"AmountMode"
  `);
  console.log("Converted import_profiles.amountMode to AmountMode enum");

  await prisma.$disconnect();
  console.log("\nAll conversions complete!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
