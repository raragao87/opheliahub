import { describe, it, expect } from "vitest";
import { extractDisplayName } from "@/lib/recurring";

describe("extractDisplayName", () => {
  // ── Short & clean descriptions (pass-through) ──────────────────────

  it("returns short clean descriptions as-is", () => {
    expect(extractDisplayName("Albert Heijn")).toBe("Albert Heijn");
    expect(extractDisplayName("Netflix")).toBe("Netflix");
    expect(extractDisplayName("Spotify Premium")).toBe("Spotify Premium");
  });

  it("returns empty string for empty input", () => {
    expect(extractDisplayName("")).toBe("");
    expect(extractDisplayName("  ")).toBe("");
  });

  // ── SEPA /NAME/ format (ABN AMRO, ING, Rabobank MT940) ────────────

  it("extracts counterparty from /TRTP/.../NAME/.../REMI/", () => {
    expect(
      extractDisplayName(
        "/TRTP/SEPA Incasso algemeen doorlopend/CSID/NL06ZZZ412345678901/NAME/Netflix International B.V./MARF/ABC123/REMI/Subscription/IBAN/NL12ABCD0123456789/BIC/ABCDNL2A"
      )
    ).toBe("Netflix International B.V.");
  });

  it("extracts counterparty from /NAME/ followed by /IBAN/", () => {
    expect(
      extractDisplayName(
        "/TRTP/SEPA Overboeking/NAME/J. de Vries/IBAN/NL12RABO0123456789/BIC/RABONL2U/REMI/Huur januari"
      )
    ).toBe("J. de Vries");
  });

  it("extracts counterparty when /NAME/ is the last field", () => {
    expect(
      extractDisplayName("/TRTP/SEPA CT/NAME/Bol.com B.V.")
    ).toBe("Bol.com B.V.");
  });

  it("extracts counterparty from /NAME/ followed by /EREF/", () => {
    expect(
      extractDisplayName(
        "/TRTP/SEPA Incasso/NAME/KPN B.V./EREF/KPN-2024-001/IBAN/NL55INGB0000000123"
      )
    ).toBe("KPN B.V.");
  });

  // ── "Naam:" format (ABN AMRO, ING, SEPA) ─────────────────────────

  it("extracts from ABN AMRO Naam: format with double spaces", () => {
    expect(
      extractDisplayName(
        "Naam: Spotify AB  Omschrijving: Premium Family  IBAN: NL12ABNA0123456789"
      )
    ).toBe("Spotify AB");
  });

  it("extracts from ABN AMRO Naam: with Kenmerk:", () => {
    expect(
      extractDisplayName(
        "Naam: Ziggo Services B.V.  Kenmerk: 1234567890  Machtiging: AB12345"
      )
    ).toBe("Ziggo Services B.V.");
  });

  it("extracts from ABN AMRO fixed-width SEPA Overboeking", () => {
    expect(
      extractDisplayName(
        "SEPA Overboeking                 IBAN: NL94ABNA0105988634        BIC: ABNANL2A                    Naam: R BARBOSA DE ANDRADE ARA"
      )
    ).toBe("R BARBOSA DE ANDRADE ARA");
  });

  it("extracts from ABN AMRO SEPA Overboeking with Omschrijving", () => {
    expect(
      extractDisplayName(
        "SEPA Overboeking                 IBAN: NL31REVO2936890953        BIC: REVONL22                    Naam: Roberto Barbosa de Andrade Ara                             Omschrijving: OBAX28KJC6S1TJ3F0"
      )
    ).toBe("Roberto Barbosa de Andrade Ara");
  });

  it("extracts from ABN AMRO SEPA Incasso with fixed-width fields", () => {
    expect(
      extractDisplayName(
        "SEPA Incasso algemeen doorlopend Incassant: NL41ZZZ671825500000  Naam: ODIDO NETHERLANDS B.V.     Machtiging: JNC82376            Omschrijving: Odido Internet + T V JNC82376 Factuur TMT1044989721IBAN: NL95COBA0637055934         Kenmerk: 501031169818"
      )
    ).toBe("ODIDO NETHERLANDS B.V.");
  });

  it("extracts from ABN AMRO SEPA iDEAL with Naam:", () => {
    expect(
      extractDisplayName(
        "SEPA iDEAL                       IBAN: NL35RABO0117713678        BIC: RABONL2U                    Naam: Coolblue B.V.              Omschrijving: 123456789"
      )
    ).toBe("Coolblue B.V.");
  });

  it("extracts from ABN AMRO Naam: at end of string (truncated by bank)", () => {
    expect(
      extractDisplayName(
        "SEPA Overboeking                 IBAN: NL94ABNA0105988634        BIC: ABNANL2A                    Naam: T.A. Lelik"
      )
    ).toBe("T.A. Lelik");
  });

  // ── "Overschrijving van/naar" (ABN internal transfer) ───────────

  it("extracts name from 'Overschrijving van' format", () => {
    expect(
      extractDisplayName("Overschrijving van ROBERTO BARBOSA DE ANDRADE ARAGAO")
    ).toBe("ROBERTO BARBOSA DE ANDRADE ARAGAO");
  });

  // ── Savings account transfers ───────────────────────────────────

  it("extracts account name from Deposito aan 'account'", () => {
    expect(
      extractDisplayName("Deposito aan 'Dagelijkse Spaarrekening'")
    ).toBe("Dagelijkse Spaarrekening");
  });

  it("extracts account name from Opname van 'account'", () => {
    expect(
      extractDisplayName("Opname van 'Dagelijkse Spaarrekening'")
    ).toBe("Dagelijkse Spaarrekening");
  });

  // ── ING formats ───────────────────────────────────────────────────

  it("extracts from ING Naam: with IBAN:", () => {
    expect(
      extractDisplayName("Naam: Albert Heijn 1234  IBAN: NL12INGB0123456789")
    ).toBe("Albert Heijn 1234");
  });

  it("extracts from ING Betaalautomaat format", () => {
    expect(
      extractDisplayName(
        "Betaalautomaat 14:32 pas 1234 ALBERT HEIJN 5678 AMSTERDAM"
      )
    ).toBe("ALBERT HEIJN");
  });

  it("extracts from ING Geldautomaat (ATM)", () => {
    expect(
      extractDisplayName("Geldautomaat 10:15 pas 4321 ING AMSTERDAM")
    ).toBe("ING");
  });

  it("returns ING Bank for ING internal descriptions", () => {
    // Short and clean — used as-is since it's already a good display name
    expect(extractDisplayName("ING Bank Kosten OranjePakket")).toBe("ING Bank Kosten OranjePakket");
    // Longer descriptions starting with "ING Bank" or "ING BANK" still get shortened
    expect(extractDisplayName("ING BANK N.V. Maandelijkse kosten betaalpakket december 2024")).toBe("ING Bank");
  });

  // ── Rabobank formats ──────────────────────────────────────────────

  it("extracts from Rabobank 'Naar <name>' format", () => {
    expect(
      extractDisplayName(
        "Naar J.A.N. Jansen  IBAN: NL12RABO0123456789  Kenmerk: huur feb"
      )
    ).toBe("J.A.N. Jansen");
  });

  it("extracts from Rabobank 'Van <name>' format", () => {
    expect(
      extractDisplayName(
        "Van Werkgever B.V.  IBAN: NL12RABO9876543210  Omschrijving: Salaris jan"
      )
    ).toBe("Werkgever B.V.");
  });

  // ── ABN AMRO bank fees ────────────────────────────────────────────

  it("extracts ABN AMRO Bank from fee descriptions", () => {
    expect(
      extractDisplayName("ABN AMRO Bank N.V. Kosten pakket jan 2024")
    ).toBe("ABN AMRO Bank");
  });

  // ── Interest descriptions ─────────────────────────────────────────

  it("extracts clean label from Nettorente descriptions", () => {
    expect(
      extractDisplayName(
        "Nettorente betaald aan 'Dagelijkse Spaarrekening' vóór 13 feb 2024"
      )
    ).toBe("Nettorente");
  });

  it("extracts Creditrente", () => {
    expect(
      extractDisplayName("Creditrente over periode 01-01-2024 t/m 31-01-2024")
    ).toBe("Creditrente");
  });

  // ── iDEAL payments ────────────────────────────────────────────────

  it("extracts merchant from iDEAL betaling description", () => {
    expect(
      extractDisplayName("iDEAL betaling aan Coolblue B.V. kenmerk 12345678")
    ).toBe("Coolblue B.V.");
  });

  it("extracts merchant from iDEAL without 'betaling'", () => {
    expect(
      extractDisplayName("iDEAL aan bol.com 1234567890123456")
    ).toBe("bol.com");
  });

  // ── /REMI/ field extraction ───────────────────────────────────────

  it("extracts from /REMI/ when no /NAME/ is present", () => {
    expect(
      extractDisplayName(
        "/TRTP/SEPA Overboeking/REMI/USTD//Huur februari 2024/IBAN/NL12ABNA0123456789"
      )
    ).toBe("Huur februari 2024");
  });

  // ── Revolut / Bunq (typically clean) ──────────────────────────────

  it("passes through clean Revolut descriptions", () => {
    expect(extractDisplayName("Uber Eats")).toBe("Uber Eats");
    expect(extractDisplayName("Amazon Prime")).toBe("Amazon Prime");
  });

  it("passes through Bunq short descriptions", () => {
    expect(extractDisplayName("Tikkie payment")).toBe("Tikkie payment");
  });

  // ── Generic SEPA field-code cleanup ───────────────────────────────

  it("strips SEPA codes when no structured NAME found", () => {
    const result = extractDisplayName(
      "/TRTP/SEPA Incasso algemeen doorlopend/CSID/NL06ZZZ412345678901/REMI/USTD//Monthly payment"
    );
    // Should extract something meaningful, not raw codes
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toContain("/TRTP/");
    expect(result).not.toContain("/CSID/");
  });

  // ── Fallback: truncated long descriptions ─────────────────────────

  it("truncates very long descriptions without recognizable patterns", () => {
    const longDesc = "A".repeat(100);
    const result = extractDisplayName(longDesc);
    expect(result.length).toBeLessThanOrEqual(54); // 50 + "..."
    expect(result).toContain("...");
  });

  it("returns full description when < 50 chars and no patterns", () => {
    const desc = "Some random bank description here";
    expect(extractDisplayName(desc)).toBe(desc);
  });
});
