import { describe, expect, it } from "vitest";

import { formatPercentChange, formatRateChange } from "./formatChange";
import { rangeStats, rateChange } from "./rangeStats";

const r = (date: string, value: string) => ({
  currency: "USD" as const,
  date,
  value,
  valueDate: date,
});

describe("rangeStats", () => {
  it("returns null for an empty range", () => {
    expect(rangeStats([])).toBeNull();
  });

  it("orders by day and summarises in decimals, whatever the input order", () => {
    const s = rangeStats([
      r("2026-10-03", "950.10"),
      r("2026-10-01", "940.20"),
      r("2026-10-02", "930"),
    ]);
    expect(s?.first.date).toBe("2026-10-01");
    expect(s?.last.value).toBe("950.10");
    expect(s?.min.value).toBe("930");
    expect(s?.max.value).toBe("950.10");
    expect(s?.average).toBe("940.10");
    expect(s?.change).toBe("9.90");
    expect(s?.changePercent).toBe("1.05");
  });

  it("measures the change between two rates", () => {
    expect(rateChange("1000", "990")).toEqual({ change: "-10.00", percent: "-1.00" });
  });
});

describe("formatChange", () => {
  it("signs rate differences and percentages", () => {
    expect(formatRateChange("12.4", "es")).toBe("+$12,40");
    expect(formatRateChange("-3.05", "es")).toBe("−$3,05");
    expect(formatRateChange("0.00", "es")).toBe("$0,00");
    expect(formatPercentChange("1.94", "en")).toBe("+1.9%");
  });
});
