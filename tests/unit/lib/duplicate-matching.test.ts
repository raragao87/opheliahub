import { describe, it, expect } from "vitest";
import { extractIbans, descriptionsMatch } from "@/lib/duplicate-matching";

describe("extractIbans", () => {
  it("extracts an IBAN from ABN TRTP format", () => {
    expect(
      extractIbans("/TRTP/SEPA OVERBOEKING/IBAN/NL32REVO0921990154/BIC/REVONL22/NAME/ROBERTO")
    ).toEqual(["NL32REVO0921990154"]);
  });

  it("extracts an IBAN from ABN settled format with padding", () => {
    expect(
      extractIbans("SEPA Overboeking                 IBAN: NL32REVO0921990154        BIC: REVONL22")
    ).toEqual(["NL32REVO0921990154"]);
  });

  it("returns empty array when no IBAN present", () => {
    expect(extractIbans("Albert Heijn 1234 AMSTERDAM")).toEqual([]);
  });

  it("dedupes repeated IBANs", () => {
    expect(
      extractIbans("IBAN: NL32REVO0921990154 ref NL32REVO0921990154")
    ).toEqual(["NL32REVO0921990154"]);
  });

  it("extracts an all-numeric (Belgian) IBAN without gluing to BIC", () => {
    expect(extractIbans("SEPA Overboeking IBAN: BE32905284529602 BIC: TRWIBEB1")).toEqual([
      "BE32905284529602",
    ]);
    expect(
      extractIbans("/TRTP/SEPA OVERBOEKING/IBAN/BE32905284529602/BIC/TRWIBEB1/NAME/Lainara")
    ).toEqual(["BE32905284529602"]);
  });
});

describe("descriptionsMatch — real bank format variants", () => {
  it("matches ABN settled vs TRTP format for a Belgian IBAN", () => {
    expect(
      descriptionsMatch(
        "SEPA Overboeking IBAN: BE32905284529602 BIC:",
        "/TRTP/SEPA OVERBOEKING/IBAN/BE32905284529602/BIC/TRWIBEB1/NAME/Lainara"
      )
    ).toBe(true);
  });

  it("matches ABN settled vs TRTP format for a Dutch IBAN", () => {
    expect(
      descriptionsMatch(
        "SEPA Overboeking IBAN: NL32REVO0921990154 BIC",
        "/TRTP/SEPA OVERBOEKING/IBAN/NL32REVO0921990154/BIC/REVONL22/NAME/ROBERTO"
      )
    ).toBe(true);
  });
});

describe("descriptionsMatch", () => {
  it("matches identical prefixes (legacy behavior)", () => {
    expect(descriptionsMatch("Albert Heijn 1234", "Albert Heijn 1234 AMSTERDAM")).toBe(true);
  });

  it("matches ABN pending vs settled format via shared IBAN", () => {
    // The exact real-world case that produced duplicates: same transfer,
    // different export format, prefix comparison fails.
    const pending = "/TRTP/SEPA OVERBOEKING/IBAN/NL32REVO0921990154/BIC/REVONL22/NAME/ROBERTO BARBOSA";
    const settled = "SEPA Overboeking                 IBAN: NL32REVO0921990154        BIC: REVONL22";
    expect(descriptionsMatch(pending, settled)).toBe(true);
  });

  it("does not match different counterparty IBANs", () => {
    const a = "/TRTP/SEPA OVERBOEKING/IBAN/NL32REVO0921990154/BIC/REVONL22";
    const b = "SEPA Overboeking                 IBAN: NL26RABO0190224541        BIC: RABONL2U";
    expect(descriptionsMatch(a, b)).toBe(false);
  });

  it("does not match unrelated descriptions without IBANs", () => {
    expect(descriptionsMatch("Albert Heijn 1234", "Jumbo Amsterdam")).toBe(false);
  });
});
