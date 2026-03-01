/**
 * Vitest global setup: loads .env.local so integration tests can use
 * MINIMAX_API_KEY and other secrets without committing them.
 *
 * Only sets vars that are not already in process.env, so CI can override
 * via real environment variables.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const envLocalPath = resolve(process.cwd(), ".env.local");

if (existsSync(envLocalPath)) {
  const content = readFileSync(envLocalPath, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Don't override vars already set in the environment (CI can override)
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
