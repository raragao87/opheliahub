/**
 * Enable Banking (PSD2 aggregator) HTTP client.
 *
 * Auth: we hold an application id + an RS256 private key (env). Per request we
 * sign a ~1h JWT and send it as a Bearer token. No per-user bank tokens are
 * ever stored — Enable Banking holds the bank consent; we keep only the
 * non-secret session id + account uids.
 *
 * Pure server module — no Prisma, no Next. Errors throw with descriptive
 * messages (same style as scripts/fetch-currency-rates.ts).
 */
import { SignJWT, importPKCS8 } from "jose";
import { env } from "@/env";

const BASE = "https://api.enablebanking.com";
const JWT_TTL_SECONDS = 3600;

export interface Aspsp {
  name: string;
  country: string;
  /** Max consent validity in seconds (per-bank, PSD2). */
  maximum_consent_validity?: number;
  logo?: string;
}

export interface EnableBankingTx {
  /** Stable bank-side id — preferred for dedup. */
  entry_reference?: string;
  transaction_id?: string;
  booking_date?: string; // YYYY-MM-DD
  value_date?: string;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: "CRDT" | "DBIT";
  status: "BOOK" | "PDNG";
  remittance_information?: string[];
  creditor?: { name?: string };
  debtor?: { name?: string };
}

export interface DiscoveredAccount {
  uid: string;
  name?: string;
  iban?: string;
  currency?: string;
  product?: string;
}

/** Optional PSU (end-user) headers — lift the background rate limit when the user is online. */
export interface PsuHeaders {
  psuIpAddress?: string;
  psuUserAgent?: string;
}

let cachedKeyPromise: Promise<CryptoKey> | null = null;

async function getPrivateKey() {
  if (!env.ENABLE_BANKING_PRIVATE_KEY || !env.ENABLE_BANKING_APP_ID) {
    throw new Error(
      "Enable Banking is not configured. Set ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY."
    );
  }
  if (!cachedKeyPromise) {
    // Vercel stores PEM newlines as the literal two-character sequence "\n".
    const pem = env.ENABLE_BANKING_PRIVATE_KEY.replace(/\\n/g, "\n");
    cachedKeyPromise = importPKCS8(pem, "RS256");
  }
  return cachedKeyPromise;
}

async function getAuthToken(): Promise<string> {
  const key = await getPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: env.ENABLE_BANKING_APP_ID!, typ: "JWT" })
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt(now)
    .setExpirationTime(now + JWT_TTL_SECONDS)
    .sign(key);
}

async function ebFetch<T>(
  path: string,
  init: RequestInit & { psu?: PsuHeaders } = {}
): Promise<T> {
  const { psu, ...rest } = init;
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (psu?.psuIpAddress) headers["psu-ip-address"] = psu.psuIpAddress;
  if (psu?.psuUserAgent) headers["psu-user-agent"] = psu.psuUserAgent;

  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(
      `Enable Banking ${rest.method ?? "GET"} ${path} failed: ${res.status} ${body.slice(0, 300)}`
    );
    // Surface auth/consent failures so callers can flip a connection to EXPIRED.
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

/** List banks (ASPSPs) available in a country, e.g. "NL". */
export async function listAspsps(country: string): Promise<Aspsp[]> {
  const data = await ebFetch<{ aspsps: Aspsp[] }>(
    `/aspsps?country=${encodeURIComponent(country)}`
  );
  return data.aspsps ?? [];
}

/** Begin a consent flow — returns the bank's authorization URL to redirect the user to. */
export async function startAuth(args: {
  aspspName: string;
  aspspCountry: string;
  redirectUrl: string;
  state: string;
  validUntil: Date;
}): Promise<{ url: string }> {
  return ebFetch<{ url: string }>(`/auth`, {
    method: "POST",
    body: JSON.stringify({
      access: { valid_until: args.validUntil.toISOString() },
      aspsp: { name: args.aspspName, country: args.aspspCountry },
      redirect_url: args.redirectUrl,
      state: args.state,
    }),
  });
}

/** Exchange the post-consent code for a session + the list of authorized account uids. */
export async function createSession(code: string): Promise<{
  session_id: string;
  accounts: string[];
  aspsp: { name: string; country: string };
}> {
  return ebFetch(`/sessions`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function getAccountDetails(uid: string): Promise<DiscoveredAccount> {
  const data = await ebFetch<{ account?: DiscoveredAccount } & DiscoveredAccount>(
    `/accounts/${encodeURIComponent(uid)}/details`
  );
  // Some responses nest under `account`; normalize.
  const acc = data.account ?? data;
  return { uid, name: acc.name, iban: acc.iban, currency: acc.currency, product: acc.product };
}

export async function getAccountBalances(uid: string): Promise<
  Array<{ amount: string; currency: string; name?: string }>
> {
  const data = await ebFetch<{ balances?: Array<{ balance_amount: { amount: string; currency: string }; name?: string }> }>(
    `/accounts/${encodeURIComponent(uid)}/balances`
  );
  return (data.balances ?? []).map((b) => ({
    amount: b.balance_amount.amount,
    currency: b.balance_amount.currency,
    name: b.name,
  }));
}

export async function getTransactions(
  uid: string,
  dateFrom: string,
  psu?: PsuHeaders
): Promise<EnableBankingTx[]> {
  const data = await ebFetch<{ transactions: EnableBankingTx[] }>(
    `/accounts/${encodeURIComponent(uid)}/transactions?date_from=${dateFrom}`,
    { psu }
  );
  return data.transactions ?? [];
}
