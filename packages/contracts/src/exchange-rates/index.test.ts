import { describe, expect, it } from "vitest";

import {
  EXCHANGE_RANGE_MAX_DAYS,
  exchangeRangeDays,
  exchangeRateSchema,
  isCarried,
  listExchangeRatesQuerySchema,
  rateOn,
  resolveExchangeRange,
  type ExchangeRate,
} from "./index";

const row = (
  currency: "USD" | "CLF",
  date: string,
  value: string,
  valueDate: string = date,
): ExchangeRate => ({ currency, date, value, valueDate });

describe("exchangeRateSchema", () => {
  it("parses a published row", () => {
    expect(exchangeRateSchema.parse(row("USD", "2026-10-08", "979.85"))).toEqual(
      row("USD", "2026-10-08", "979.85"),
    );
  });

  it("rejects a currency other than USD or CLF", () => {
    expect(exchangeRateSchema.safeParse(row("USD", "2026-10-08", "1")).success).toBe(true);
    expect(
      exchangeRateSchema.safeParse({ ...row("USD", "2026-10-08", "1"), currency: "EUR" }).success,
    ).toBe(false);
  });

  it("rejects a non-positive value", () => {
    expect(exchangeRateSchema.safeParse(row("USD", "2026-10-08", "0")).success).toBe(false);
    expect(exchangeRateSchema.safeParse(row("USD", "2026-10-08", "-5")).success).toBe(false);
  });

  it("rejects a value published AFTER the day it answers for", () => {
    expect(
      exchangeRateSchema.safeParse(row("CLF", "2026-10-08", "41000", "2026-10-09")).success,
    ).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(exchangeRateSchema.safeParse(row("USD", "08-10-2026", "1")).success).toBe(false);
  });
});

describe("isCarried", () => {
  it("is true only when the value was published before the day it answers for", () => {
    expect(isCarried(row("USD", "2026-10-10", "970", "2026-10-09"))).toBe(true);
    expect(isCarried(row("USD", "2026-10-09", "970"))).toBe(false);
  });
});

describe("rateOn", () => {
  const rows = [
    row("USD", "2026-10-08", "979.85"),
    row("USD", "2026-10-07", "967.79"),
    row("USD", "2026-10-05", "984.82"),
    row("CLF", "2026-10-07", "41100"),
  ];

  it("returns the row of that exact day", () => {
    expect(rateOn(rows, "USD", "2026-10-07")?.value).toBe("967.79");
  });

  it("falls back to the closest earlier day", () => {
    expect(rateOn(rows, "USD", "2026-10-06")?.value).toBe("984.82");
  });

  it("returns null when nothing is that old", () => {
    expect(rateOn(rows, "USD", "2026-10-01")).toBeNull();
  });

  it("ignores rows of another currency", () => {
    expect(rateOn(rows, "CLF", "2026-10-08")?.value).toBe("41100");
    expect(rateOn(rows, "USD", "2026-10-08")?.value).toBe("979.85");
  });

  it("does not depend on the order of the rows", () => {
    expect(rateOn([...rows].reverse(), "USD", "2026-10-06")?.value).toBe("984.82");
  });
});

describe("list query", () => {
  it("accepts an empty query", () => {
    expect(listExchangeRatesQuerySchema.parse({})).toEqual({});
  });

  it("accepts a currency and day-precision bounds", () => {
    expect(
      listExchangeRatesQuerySchema.parse({ currency: "USD", from: "2026-09-01", to: "2026-09-30" }),
    ).toEqual({ currency: "USD", from: "2026-09-01", to: "2026-09-30" });
  });

  it("rejects a malformed bound", () => {
    expect(listExchangeRatesQuerySchema.safeParse({ from: "yesterday" }).success).toBe(false);
  });
});

describe("resolveExchangeRange", () => {
  it("defaults to the last 30 days ending today", () => {
    expect(resolveExchangeRange({}, "2026-10-08")).toEqual({ from: "2026-09-08", to: "2026-10-08" });
  });

  it("keeps what the caller asked for", () => {
    expect(resolveExchangeRange({ from: "2026-01-01", to: "2026-01-31" }, "2026-10-08")).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
    });
  });

  it("defaults only the missing bound", () => {
    expect(resolveExchangeRange({ to: "2026-03-31" }, "2026-10-08")).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
    });
  });
});

describe("exchangeRangeDays", () => {
  it("counts days inclusively", () => {
    expect(exchangeRangeDays("2026-10-08", "2026-10-08")).toBe(1);
    expect(exchangeRangeDays("2026-10-01", "2026-10-08")).toBe(8);
  });

  it("is negative-free: an inverted range reports 0", () => {
    expect(exchangeRangeDays("2026-10-09", "2026-10-08")).toBe(0);
  });

  it("exposes the 400-day ceiling the API enforces", () => {
    expect(EXCHANGE_RANGE_MAX_DAYS).toBe(400);
  });
});
