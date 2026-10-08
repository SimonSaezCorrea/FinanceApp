import { describe, expect, it } from "vitest";

import {
  addMoney,
  convertAmount,
  currencySymbol,
  formatMoney,
  moneyToString,
  subtractMoney,
  sumMoney,
  toMoney,
} from "./index.js";

describe("money", () => {
  it("preserves precision that floats would lose", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in float; must be exact here.
    expect(addMoney("0.1", "0.2")).toBe("0.3000");
  });

  it("serializes to fixed 4-decimal scale", () => {
    expect(moneyToString("1240.5")).toBe("1240.5000");
    expect(moneyToString(5)).toBe("5.0000");
  });

  it("sums a list exactly", () => {
    expect(sumMoney(["10.10", "20.20", "0.70"])).toBe("31.0000");
  });

  it("subtracts exactly", () => {
    expect(subtractMoney("100.00", "33.33")).toBe("66.6700");
  });

  it("uses banker's rounding (half-even)", () => {
    expect(moneyToString("1.00005", 4)).toBe("1.0000");
    expect(moneyToString("1.00015", 4)).toBe("1.0002");
  });

  it("rejects invalid input", () => {
    expect(() => toMoney("not-a-number")).toThrow();
  });

  describe("formatMoney", () => {
    it("shows CLP as its $ symbol, not the ISO code", () => {
      // Bare "es" has no currency-symbol mapping for CLP and falls back to
      // the code ("95.000 CLP") — this app's "es" locale IS Chilean Spanish.
      expect(formatMoney("95000", { locale: "es", currency: "CLP" })).toBe("$95.000");
    });

    it("disambiguates USD from CLP's bare $", () => {
      expect(formatMoney("95000", { locale: "es", currency: "USD" })).toBe("US$95.000,00");
    });

    it("keeps the ISO code for CLF (the UF), which has no real symbol", () => {
      const formatted = formatMoney("95000", { locale: "es", currency: "CLF" });
      expect(formatted).toContain("CLF");
      expect(formatted).not.toContain("$");
    });

    it("leaves an already region-qualified locale untouched", () => {
      expect(formatMoney("95000", { locale: "en-US", currency: "USD" })).toBe("$95,000.00");
    });
  });

  describe("currencySymbol", () => {
    it("resolves CLP's $ the same way formatMoney does", () => {
      expect(currencySymbol("CLP", "es")).toBe("$");
    });

    it("disambiguates USD as US$ in Chilean Spanish", () => {
      expect(currencySymbol("USD", "es")).toBe("US$");
    });

    it("falls back to the ISO code for CLF, which has no real symbol", () => {
      expect(currencySymbol("CLF", "es")).toBe("CLF");
    });
  });
});

describe("convertAmount", () => {
  it("converts dollars to whole pesos at the given rate", () => {
    expect(convertAmount("100", "950", "CLP")).toBe("95000");
  });

  it("rounds to the target currency's minor unit (a peso has no cents)", () => {
    // 50,41 × 979,85 = 49.394,2385 → 49.394
    expect(convertAmount("50.41", "979.85", "CLP")).toBe("49394");
  });

  it("keeps two decimals when the target is USD and four for the UF", () => {
    expect(convertAmount("10", "0.0010526", "USD")).toBe("0.01");
    expect(convertAmount("10", "0.0010526", "CLF")).toBe("0.0105");
  });

  it("is exact where float arithmetic drifts", () => {
    // 0.1 * 3 === 0.30000000000000004 in float.
    expect(convertAmount("0.1", "3", "CLF")).toBe("0.3000");
    expect(convertAmount("1.1", "1000", "CLP")).toBe("1100");
  });

  it("rejects a zero, negative or non-numeric rate", () => {
    expect(() => convertAmount("100", "0", "CLP")).toThrow();
    expect(() => convertAmount("100", "-950", "CLP")).toThrow();
    expect(() => convertAmount("100", "abc", "CLP")).toThrow();
  });

  it("keeps the sign of the amount (a debt converts to a negative figure)", () => {
    expect(convertAmount("-20", "980", "CLP")).toBe("-19600");
  });
});
