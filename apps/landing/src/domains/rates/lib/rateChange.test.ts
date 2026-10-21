import { describe, expect, it } from "vitest";

import type { ExchangeRate } from "@finance/contracts/exchange-rate-rules";

import { rateChange } from "./rateChange";

const row = (date: string, value: string, currency: "USD" | "CLF" = "USD"): ExchangeRate => ({
  currency,
  date,
  value,
  valueDate: date,
});

describe("rateChange (FR-002)", () => {
  const rows = [
    row("2026-10-21", "950.5"),
    row("2026-10-20", "940.25"),
    row("2026-10-18", "930"),
    row("2026-10-21", "40000", "CLF"),
  ];

  it("compares with the previous recorded day of the same currency", () => {
    expect(rateChange(rows, rows[0]!)).toEqual({
      previous: rows[1],
      change: "10.25",
      percent: "1.09",
    });
  });

  it("skips gaps: the previous row is the newest one before it", () => {
    expect(rateChange(rows, rows[1]!)?.previous.date).toBe("2026-10-18");
  });

  it("is zero when the day was carried (same value)", () => {
    const carried = [row("2026-10-21", "940.25"), row("2026-10-20", "940.25")];
    expect(rateChange(carried, carried[0]!)).toMatchObject({ change: "0.00", percent: "0.00" });
  });

  it("is a fall with a negative sign", () => {
    expect(
      rateChange([row("2026-10-21", "900"), row("2026-10-20", "1000")], row("2026-10-21", "900")),
    ).toMatchObject({ change: "-100.00", percent: "-10.00" });
  });

  it("is null on the first recorded day", () => {
    expect(rateChange(rows, rows[2]!)).toBeNull();
    expect(rateChange(rows, rows[3]!)).toBeNull();
  });
});
