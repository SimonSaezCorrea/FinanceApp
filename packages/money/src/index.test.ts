import { describe, expect, it } from "vitest";

import {
  addMoney,
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
