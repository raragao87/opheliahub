/**
 * Signed state for the bank consent callback (CSRF defense).
 *
 * The state travels to the bank and back; we never trust the returned value
 * without verifying the HMAC and expiry. Independent of the session cookie.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

export interface BankState {
  userId: string;
  householdId: string;
  aspspName: string;
  aspspCountry: string;
  validUntil: string; // ISO — desired consent expiry
  nonce: string;
  exp: number; // unix seconds — state itself expires (short-lived)
}

function secret(): string {
  if (!env.BANK_STATE_SECRET) {
    throw new Error("BANK_STATE_SECRET is not set — cannot sign bank consent state.");
  }
  return env.BANK_STATE_SECRET;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function signState(payload: Omit<BankState, "nonce" | "exp"> & { exp?: number }): string {
  const full: BankState = {
    ...payload,
    nonce: b64url(createHmac("sha256", secret()).update(Math.random().toString()).digest()).slice(0, 16),
    exp: payload.exp ?? Math.floor(Date.now() / 1000) + 600, // 10 min
  };
  const body = b64url(Buffer.from(JSON.stringify(full)));
  const sig = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyState(token: string): BankState | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(createHmac("sha256", secret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const state = JSON.parse(Buffer.from(body, "base64url").toString()) as BankState;
    if (state.exp < Math.floor(Date.now() / 1000)) return null;
    return state;
  } catch {
    return null;
  }
}
