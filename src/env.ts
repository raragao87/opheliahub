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
});

export const env = envSchema.parse(process.env);
