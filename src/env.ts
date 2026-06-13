import { z } from "zod";

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Auth
  AUTH_SECRET: z.string().min(1),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  AUTH_URL: z.string().url(),

  // Ophelia AI assistant
  ANTHROPIC_API_KEY: z.string().optional(),
  MINIMAX_API_KEY: z.string().optional(),
  OPHELIA_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  OPHELIA_CRON_SECRET: z.string().optional(),

  // Enable Banking (PSD2 automatic import)
  ENABLE_BANKING_APP_ID: z.string().optional(),
  ENABLE_BANKING_PRIVATE_KEY: z.string().optional(), // PEM (PKCS8); newlines may be \n-escaped
  ENABLE_BANKING_REDIRECT_URL: z.string().url().optional(), // e.g. https://<app>/api/bank/callback
  BANK_STATE_SECRET: z.string().optional(), // HMAC key for the consent-callback state nonce
});

export const env = envSchema.parse(process.env);
