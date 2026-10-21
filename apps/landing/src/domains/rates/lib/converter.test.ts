import { describe, expect, it } from "vitest";

import { toMoney } from "@finance/money";

import { formatAmountInput, fromPesos, parseAmount, toPesos } from "./converter";

describe("parseAmount (FR-011, by page language)", () => {
  it("reads Spanish: dot thousands, comma decimals", () => {
    expect(parseAmount("3,5", "es")).toBe("3.5");
    expect(parseAmount("500.000", "es")).toBe("500000");
    expect(parseAmount(" 1.234.567,89 ", "es")).toBe("1234567.89");
  });

  it("in Spanish, reads a lone dot that isn't a thousands group as a decimal point", () => {
    expect(parseAmount("1.5", "es")).toBe("1.5");
    expect(parseAmount("1.50", "es")).toBe("1.50");
    expect(parseAmount("1.5000000", "es")).toBe("1.5000000");
    expect(parseAmount("1.500", "es")).toBe("1500");
  });

  it("reads English: comma thousands, dot decimals", () => {
    expect(parseAmount("3.5", "en")).toBe("3.5");
    expect(parseAmount("500,000", "en")).toBe("500000");
  });

  it("keeps every decimal typed", () => {
    expect(parseAmount("0,000000012345678", "es")).toBe("0.000000012345678");
  });

  it("refuses empty, zero, negative and non-numeric input", () => {
    for (const bad of ["", "   ", "0", "0,00", "-5", "abc", "1,2,3", "1e5"]) {
      expect(parseAmount(bad, "es"), bad).toBeNull();
    }
  });
});

describe("conversion at full precision (FR-010, clarified 2026-10-21)", () => {
  it("unit to pesos is the exact product, never rounded to whole pesos", () => {
    expect(toPesos("3.5", "39882.68")).toBe("139589.38");
    expect(toPesos("1", "941.6632")).toBe("941.6632");
    expect(toPesos("0.0001", "39882.68")).toBe("3.988268");
    expect(toPesos("1000", "981.61")).toBe("981610");
  });

  it("pesos to unit keeps every significant digit (20), without trailing zeros", () => {
    expect(fromPesos("1", "39882.68")).toBe("0.000025073540694858018568");
    expect(fromPesos("981.61", "981.61")).toBe("1");
    const back = toMoney(fromPesos("100000", "39882.68")).times("39882.68");
    expect(back.minus(100000).abs().lessThan("0.000001")).toBe(true);
  });

  it("never writes an exponent", () => {
    expect(fromPesos("1", "100000000")).toBe("0.00000001");
    expect(toPesos("123456789012345", "1000000")).toBe("123456789012345000000");
  });
});

describe("formatAmountInput", () => {
  it("groups the integer part and keeps every decimal of the value", () => {
    expect(formatAmountInput("139589.38", "es")).toBe("139.589,38");
    expect(formatAmountInput("0.000025073541292603627695", "es")).toBe(
      "0,000025073541292603627695",
    );
    expect(formatAmountInput("1530.98", "en")).toBe("1,530.98");
    expect(formatAmountInput("981610", "es")).toBe("981.610");
  });
});
