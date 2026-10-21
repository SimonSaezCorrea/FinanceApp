import { describe, expect, it } from "vitest";

import { formatPercentChange, formatRate, formatRateChange } from "./rateFormat.js";

describe("formatRate", () => {
  it("keeps two decimals, Chilean grouping in Spanish", () => {
    expect(formatRate("41122.7400", "es")).toBe("$41.122,74");
    expect(formatRate("979.85", "es-CL")).toBe("$979,85");
  });

  it("uses English grouping in English", () => {
    expect(formatRate("41122.74", "en")).toBe("$41,122.74");
  });
});

describe("formatRateChange", () => {
  it("signs a rise, a fall and no change", () => {
    expect(formatRateChange("12.4", "es")).toBe("+$12,40");
    expect(formatRateChange("-3.05", "es")).toBe("−$3,05");
    expect(formatRateChange("0", "es")).toBe("$0,00");
  });
});

describe("formatPercentChange", () => {
  it("one decimal, signed except zero", () => {
    expect(formatPercentChange("1.94", "en")).toBe("+1.9%");
    expect(formatPercentChange("-0.42", "en")).toBe("-0.4%");
    expect(formatPercentChange("0", "en")).toBe("0.0%");
  });
});
