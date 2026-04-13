/**
 * Fetch daily EUR exchange rates and store in CurrencyRate table.
 * Fetches EUR→USD and EUR→BRL from ECB API (fallback: exchangerate.host).
 *
 * Usage: npx tsx scripts/fetch-currency-rates.ts
 * Schedule via PM2: cron_restart "0 8 * * *"
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CURRENCIES = ["USD", "BRL"];
const BASE = "EUR";

function toMicroRate(rate: number): number {
  return Math.round(rate * 1_000_000);
}

async function fetchRates(): Promise<Record<string, number>> {
  // Try ECB first (official, free, no API key)
  try {
    const symbols = CURRENCIES.join("+");
    const url = `https://data-api.ecb.europa.eu/service/data/EXR/D.${symbols}.EUR.SP00.A?lastNObservations=1&format=csvdata`;
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      const rates: Record<string, number> = {};
      const lines = text.trim().split("\n");
      const header = lines[0].split(",");
      const currencyIdx = header.indexOf("CURRENCY");
      const valueIdx = header.indexOf("OBS_VALUE");
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        const currency = cols[currencyIdx];
        const value = parseFloat(cols[valueIdx]);
        if (currency && !isNaN(value)) {
          rates[currency] = value;
        }
      }
      if (Object.keys(rates).length > 0) {
        console.log("Fetched rates from ECB:", rates);
        return rates;
      }
    }
  } catch (e) {
    console.warn("ECB fetch failed, trying fallback:", e);
  }

  // Fallback: exchangerate.host
  try {
    const url = `https://api.exchangerate.host/latest?base=${BASE}&symbols=${CURRENCIES.join(",")}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json() as { rates?: Record<string, number> };
      if (data.rates) {
        console.log("Fetched rates from exchangerate.host:", data.rates);
        return data.rates;
      }
    }
  } catch (e) {
    console.warn("exchangerate.host fetch failed:", e);
  }

  throw new Error("All rate sources failed");
}

async function main() {
  const rates = await fetchRates();
  const today = new Date();
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  let upserted = 0;
  for (const [currency, rate] of Object.entries(rates)) {
    if (!CURRENCIES.includes(currency)) continue;

    await prisma.currencyRate.upsert({
      where: {
        date_baseCurrency_currency: {
          date,
          baseCurrency: BASE,
          currency,
        },
      },
      create: {
        date,
        baseCurrency: BASE,
        currency,
        rate: toMicroRate(rate),
      },
      update: {
        rate: toMicroRate(rate),
      },
    });
    upserted++;
    console.log(`  ${BASE}→${currency}: ${rate} (micro: ${toMicroRate(rate)})`);
  }

  console.log(`Upserted ${upserted} rates for ${date.toISOString().slice(0, 10)}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Currency rate fetch failed:", e);
  process.exit(1);
});
