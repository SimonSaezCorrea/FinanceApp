import { describe, expect, it } from "vitest";

import { ListExchangeRatesQuery } from "../../../../../src/domains/exchange-rate/application/queries/list-exchange-rates.query";
import { ListExchangeRatesQueryHandler } from "../../../../../src/domains/exchange-rate/application/queries/list-exchange-rates.handler";
import type {
  ExchangeRateEntry,
  RateCurrency,
} from "../../../../../src/domains/exchange-rate/domain/exchange-rate.entity";
import { fakeExchangeRateRepo } from "../../../support/fake-ports";

const entry = (
  currency: RateCurrency,
  date: string,
  value: string,
  valueDate: string = date,
): ExchangeRateEntry => ({ currency, date, value, valueDate });

const ROWS = [
  entry("USD", "2026-10-08", "979.85"),
  entry("USD", "2026-10-07", "967.79"),
  entry("USD", "2026-08-01", "950"),
  entry("CLF", "2026-10-08", "41122.74"),
  entry("CLF", "2026-10-07", "41100", "2026-10-05"),
];
const TODAY = "2026-10-08";

function handler(rows = ROWS) {
  return new ListExchangeRatesQueryHandler(fakeExchangeRateRepo(rows));
}

describe("ListExchangeRatesQuery", () => {
  it("is a system-scoped read: global reference data has no user to scope by", () => {
    expect(new ListExchangeRatesQuery({}, TODAY).scope).toBe("system");
  });
});

describe("ListExchangeRatesQueryHandler", () => {
  it("answers the last 30 days, newest first, when no range is given", async () => {
    const result = await handler().execute(new ListExchangeRatesQuery({}, TODAY));

    expect(result.items.map((r) => `${r.currency}|${r.date}`)).toEqual([
      "USD|2026-10-08",
      "CLF|2026-10-08",
      "USD|2026-10-07",
      "CLF|2026-10-07",
    ]);
  });

  it("filters by currency", async () => {
    const result = await handler().execute(new ListExchangeRatesQuery({ currency: "CLF" }, TODAY));

    expect(result.items.every((r) => r.currency === "CLF")).toBe(true);
  });

  it("returns `latest` of each currency whatever range was asked for", async () => {
    const result = await handler().execute(
      new ListExchangeRatesQuery({ from: "2026-08-01", to: "2026-08-02" }, TODAY),
    );

    expect(result.items).toHaveLength(1);
    expect(result.latest.USD?.date).toBe("2026-10-08");
    expect(result.latest.CLF?.date).toBe("2026-10-08");
  });

  it("returns a null `latest` for a currency with no rows", async () => {
    const result = await handler([entry("USD", "2026-10-08", "979.85")]).execute(
      new ListExchangeRatesQuery({}, TODAY),
    );

    expect(result.latest.CLF).toBeNull();
  });

  it("exposes the carried value date, so a client can mark the row", async () => {
    const result = await handler().execute(new ListExchangeRatesQuery({ currency: "CLF" }, TODAY));

    expect(result.items.find((r) => r.date === "2026-10-07")?.valueDate).toBe("2026-10-05");
  });

  it("rejects from > to with INVALID_DATE_RANGE", async () => {
    await expect(
      handler().execute(
        new ListExchangeRatesQuery({ from: "2026-10-09", to: "2026-10-01" }, TODAY),
      ),
    ).rejects.toMatchObject({ code: "INVALID_DATE_RANGE" });
  });

  it("rejects a range of more than 400 days with EXCHANGE_RANGE_TOO_LARGE", async () => {
    await expect(
      handler().execute(
        new ListExchangeRatesQuery({ from: "2025-01-01", to: "2026-10-01" }, TODAY),
      ),
    ).rejects.toMatchObject({ code: "EXCHANGE_RANGE_TOO_LARGE" });
  });

  it("accepts exactly 400 days", async () => {
    await expect(
      handler().execute(
        new ListExchangeRatesQuery({ from: "2025-08-31", to: "2026-10-04" }, TODAY),
      ),
    ).resolves.toBeDefined();
  });
});
