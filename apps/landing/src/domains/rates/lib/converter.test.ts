import { describe, expect, it } from "vitest";

import { convertAmount } from "@finance/money";

import { formatAmountInput, fromPesos, parseAmount, toPesos } from "./converter";

describe("parseAmount (FR-011, by page language)", () => {
  it("reads Spanish: dot thousands, comma decimals", () => {
    expect(parseAmount("3,5", "es")).toBe("3.5");
    expect(parseAmount("500.000", "es")).toBe("500000");
    expect(parseAmount(" 1.234.567,89 ", "es")).toBe("1234567.89");
  });

  it("reads English: comma thousands, dot decimals", () => {
    expect(parseAmount("3.5", "en")).toBe("3.5");
    expect(parseAmount("500,000", "en")).toBe("500000");
  });

  it("refuses empty, zero, negative and non-numeric input", () => {
    for (const bad of ["", "   ", "0", "0,00", "-5", "abc", "1,2,3", "1e5"]) {
      expect(parseAmount(bad, "es"), bad).toBeNull();
    }
  });
});

describe("conversion (FR-010, SC-003)", () => {
  it("unit to pesos is exactly the app's convertAmount", () => {
    const cases = [
      ["3.5", "39882.68"],
      ["1", "941.6632"],
      ["50.41", "979.85"],
      ["0.0001", "39882.68"],
    ] as const;
    for (const [amount, value] of cases) {
      expect(toPesos(amount, value)).toBe(convertAmount(amount, value, "CLP"));
    }
  });

  it("pesos to unit rounds to the unit's precision (UF 4, dollar 2)", () => {
    expect(fromPesos("100000", "39882.68", "CLF")).toBe("2.5074");
    expect(fromPesos("500000", "941.6632", "USD")).toBe("530.98");
  });
});

describe("formatAmountInput", () => {
  it("groups and keeps only the decimals the currency has", () => {
    expect(formatAmountInput("139589.0000", "CLP", "es")).toBe("139.589");
    expect(formatAmountInput("2.5074", "CLF", "es")).toBe("2,5074");
    expect(formatAmountInput("530.98", "USD", "en")).toBe("530.98");
  });
});
