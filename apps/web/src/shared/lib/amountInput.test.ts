import { describe, expect, it } from "vitest";

import { formatTypedAmount, parseTypedAmount } from "./amountInput";

describe("parseTypedAmount", () => {
  it("keeps digits only when no decimals are allowed (a peso has no cents)", () => {
    expect(parseTypedAmount("49.394", "es-CL", 0)).toBe("49394");
    expect(parseTypedAmount("49394,5", "es-CL", 0)).toBe("49394");
    expect(parseTypedAmount("abc", "es-CL", 0)).toBe("");
  });

  it("reads the locale's own decimal separator and drops its grouping", () => {
    expect(parseTypedAmount("1.234,5", "es", 2)).toBe("1234.5");
    expect(parseTypedAmount("50,41", "es", 2)).toBe("50.41");
    expect(parseTypedAmount("1,234.5", "en", 2)).toBe("1234.5");
  });

  it("accepts a dot as the decimal separator too when the locale groups with it", () => {
    // Typing "50.41" in a Spanish UI is what a keyboard with a numeric pad produces.
    expect(parseTypedAmount("50.41", "es", 2)).toBe("50.41");
  });

  it("limits the decimals to what the currency has", () => {
    expect(parseTypedAmount("50,419", "es", 2)).toBe("50.41");
  });

  it("keeps a trailing separator while the person is still typing the decimals", () => {
    expect(parseTypedAmount("50,", "es", 2)).toBe("50.");
  });

  it("drops leading zeros but keeps a lone 0 before the decimals", () => {
    expect(parseTypedAmount("007", "es", 2)).toBe("7");
    expect(parseTypedAmount("0,5", "es", 2)).toBe("0.5");
  });

  it("ignores a second decimal separator", () => {
    expect(parseTypedAmount("1,2,3", "es", 2)).toBe("1.23");
  });
});

describe("formatTypedAmount", () => {
  it("groups the integer part with the locale's separator", () => {
    expect(formatTypedAmount("1234567", "es-CL")).toBe("1.234.567");
  });

  it("shows the decimals with the locale's separator", () => {
    expect(formatTypedAmount("1234.5", "es")).toBe("1234,5");
    expect(formatTypedAmount("50.41", "es")).toBe("50,41");
    expect(formatTypedAmount("50.41", "en")).toBe("50.41");
  });

  it("keeps a trailing separator and typed trailing zeros while typing", () => {
    expect(formatTypedAmount("50.", "es")).toBe("50,");
    expect(formatTypedAmount("50.40", "es")).toBe("50,40");
  });

  it("is empty for empty input", () => {
    expect(formatTypedAmount("", "es")).toBe("");
  });

  it("round-trips what it shows", () => {
    for (const canonical of ["1234567", "50.41", "0.5", "50."]) {
      expect(parseTypedAmount(formatTypedAmount(canonical, "es-CL"), "es-CL", 2)).toBe(canonical);
    }
  });
});
