import { describe, expect, it } from "vitest";

import type { ExchangeRate } from "@finance/contracts/exchange-rate-rules";

import { lookupDay, readDateParam, withDateParam } from "./rateDate";

const TODAY = "2026-10-21";

describe("readDateParam (FR-009, clarify Q4)", () => {
  it("reads ?fecha= in Spanish and ?date= in English", () => {
    expect(readDateParam("?fecha=2026-03-15", "es", TODAY)).toEqual({
      day: "2026-03-15",
      notice: null,
    });
    expect(readDateParam("?date=2026-03-15", "en", TODAY)).toEqual({
      day: "2026-03-15",
      notice: null,
    });
    expect(readDateParam("?date=2026-03-15", "es", TODAY)).toEqual({ day: null, notice: null });
  });

  it("no parameter is today, without a notice", () => {
    expect(readDateParam("", "es", TODAY)).toEqual({ day: null, notice: null });
  });

  it("a malformed or impossible day is today with a notice", () => {
    expect(readDateParam("?fecha=15-03-2026", "es", TODAY)).toEqual({
      day: null,
      notice: "invalid",
    });
    expect(readDateParam("?fecha=2026-02-30", "es", TODAY)).toEqual({
      day: null,
      notice: "invalid",
    });
  });

  it("a future day is today with a notice", () => {
    expect(readDateParam("?fecha=2099-01-01", "es", TODAY)).toEqual({
      day: null,
      notice: "future",
    });
  });
});

describe("withDateParam", () => {
  it("sets the language's parameter and keeps the rest of the address", () => {
    expect(withDateParam("https://mifik.cl/es/valor-uf/?x=1#c", "es", "2026-03-15")).toBe(
      "https://mifik.cl/es/valor-uf/?x=1&fecha=2026-03-15#c",
    );
  });

  it("removes it for today", () => {
    expect(withDateParam("https://mifik.cl/en/uf-value/?date=2026-03-15", "en", null)).toBe(
      "https://mifik.cl/en/uf-value/",
    );
  });
});

describe("lookupDay", () => {
  const rows: ExchangeRate[] = [
    { currency: "CLF", date: "2026-10-21", value: "2", valueDate: "2026-10-21" },
    { currency: "CLF", date: "2025-10-21", value: "1", valueDate: "2025-10-21" },
  ];

  it("finds a day the page carries", () => {
    expect(lookupDay(rows, "2025-10-21", "2025-09-01")).toEqual({
      row: rows[1],
      needsFetch: false,
    });
  });

  it("asks the API for a recorded day older than what the page carries", () => {
    expect(lookupDay(rows, "2025-09-15", "2025-09-01")).toEqual({ row: null, needsFetch: true });
  });

  it("has no data before the first recorded day", () => {
    expect(lookupDay(rows, "2025-08-31", "2025-09-01")).toEqual({ row: null, needsFetch: false });
    expect(lookupDay(rows, "2025-08-31", null)).toEqual({ row: null, needsFetch: false });
  });
});
