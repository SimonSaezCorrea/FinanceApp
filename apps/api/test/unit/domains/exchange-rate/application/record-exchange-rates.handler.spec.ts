import { describe, expect, it, vi } from "vitest";

import { RecordExchangeRatesCommand } from "../../../../../src/domains/exchange-rate/application/commands/record-exchange-rates.command";
import { RecordExchangeRatesHandler } from "../../../../../src/domains/exchange-rate/application/commands/record-exchange-rates.handler";
import {
  ExchangeRateSourceUnavailableError,
  type ExchangeRateSourcePort,
} from "../../../../../src/domains/exchange-rate/application/exchange-rate-source";
import {
  chileDay,
  daysBetween,
  type ExchangeRateEntry,
  type PublishedValue,
  type RateCurrency,
} from "../../../../../src/domains/exchange-rate/domain/exchange-rate.entity";
import { fakeExchangeRateRepo } from "../../../support/fake-ports";

/** 08:00 in Chile (UTC-3 in October). */
const MORNING = new Date("2026-10-08T11:00:00Z");
const TODAY = "2026-10-08";

const entry = (
  currency: RateCurrency,
  date: string,
  value: string,
  valueDate: string = date,
): ExchangeRateEntry => ({ currency, date, value, valueDate });

function fakeSource(
  parts: {
    latest?: Partial<Record<RateCurrency, PublishedValue>>;
    series?: Partial<Record<RateCurrency, PublishedValue[]>>;
    failLatest?: boolean;
    failSeries?: boolean;
  } = {},
) {
  const latest = {
    USD: { valueDate: TODAY, value: "979.85" },
    CLF: { valueDate: TODAY, value: "41122.74" },
    ...parts.latest,
  };
  return {
    latest: vi.fn(async () => {
      if (parts.failLatest) throw new ExchangeRateSourceUnavailableError("down");
      return latest;
    }),
    series: vi.fn(async (currency: RateCurrency, year: number) => {
      if (parts.failSeries) throw new ExchangeRateSourceUnavailableError("down");
      return (parts.series?.[currency] ?? []).filter((v) => v.valueDate.startsWith(String(year)));
    }),
  } satisfies ExchangeRateSourcePort;
}

function handlerFor(repo: ReturnType<typeof fakeExchangeRateRepo>, source: ExchangeRateSourcePort) {
  return new RecordExchangeRatesHandler({ publish: vi.fn() } as never, repo, source);
}

const run = (h: RecordExchangeRatesHandler, now = MORNING, isLastTickOfDay = false) =>
  h.execute(new RecordExchangeRatesCommand(now, isLastTickOfDay));

describe("chileDay", () => {
  it("is the calendar day in Chile, not in UTC", () => {
    // 01:30Z on the 9th is still the 8th at 22:30 in Chile (UTC-3).
    expect(chileDay(new Date("2026-10-09T01:30:00Z"))).toBe("2026-10-08");
    expect(chileDay(new Date("2026-10-08T11:00:00Z"))).toBe("2026-10-08");
  });

  it("follows the winter offset too (UTC-4)", () => {
    expect(chileDay(new Date("2026-07-15T03:30:00Z"))).toBe("2026-07-14");
  });
});

describe("RecordExchangeRatesCommand", () => {
  it("is a system-scoped command, not tied to any user", () => {
    expect(new RecordExchangeRatesCommand(MORNING, false).scope).toBe("system");
  });
});

describe("RecordExchangeRatesHandler", () => {
  it("(a) seeds the last 365 days from the yearly series of BOTH calendar years", async () => {
    const repo = fakeExchangeRateRepo();
    const published = daysBetween("2025-01-01", TODAY)
      .filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() % 6 !== 0)
      .map((d) => ({ valueDate: d, value: "950" }));
    const source = fakeSource({ series: { USD: published, CLF: published } });

    await run(handlerFor(repo, source));

    const usdRows = [...repo.rows.values()].filter((r) => r.currency === "USD");
    expect(usdRows).toHaveLength(365);
    expect(usdRows.map((r) => r.date).sort()[0]).toBe("2025-10-09");
    expect(source.series).toHaveBeenCalledWith("USD", 2025);
    expect(source.series).toHaveBeenCalledWith("USD", 2026);
    // Sunday 2026-10-04 has no publication of its own: it carries Friday's.
    expect(repo.rows.get("USD|2026-10-04")).toMatchObject({ valueDate: "2026-10-02" });
    expect(repo.rows.get("USD|2026-10-02")).toMatchObject({ valueDate: "2026-10-02" });
  });

  it("(a) discards series entries dated AFTER the day being filled (the UF is published ahead)", async () => {
    const repo = fakeExchangeRateRepo();
    const source = fakeSource({
      series: {
        USD: [{ valueDate: "2026-10-01", value: "950" }],
        CLF: [
          { valueDate: "2026-10-01", value: "41000" },
          { valueDate: "2026-10-20", value: "41500" },
        ],
      },
    });

    await run(handlerFor(repo, source));

    const clf = [...repo.rows.values()].filter((r) => r.currency === "CLF");
    for (const row of clf) expect(row.valueDate <= row.date).toBe(true);
    expect(repo.rows.get("CLF|2026-10-07")).toMatchObject({
      value: "41000",
      valueDate: "2026-10-01",
    });
  });

  it("(b) a weekday run stores today's published value, with no series call when there is no gap", async () => {
    const repo = fakeExchangeRateRepo([
      entry("USD", "2026-10-07", "967.79"),
      entry("CLF", "2026-10-07", "41100"),
    ]);
    const source = fakeSource();

    const result = await run(handlerFor(repo, source));

    expect(repo.rows.get(`USD|${TODAY}`)).toEqual(entry("USD", TODAY, "979.85"));
    expect(repo.rows.get(`CLF|${TODAY}`)).toEqual(entry("CLF", TODAY, "41122.74"));
    expect(source.series).not.toHaveBeenCalled();
    expect(result.outcome).toBe("recorded");
  });

  it("(c) stores a value the source has not renewed yet as CARRIED (valueDate before the day)", async () => {
    const repo = fakeExchangeRateRepo([
      entry("USD", "2026-10-07", "967.79"),
      entry("CLF", "2026-10-07", "41100"),
    ]);
    const source = fakeSource({ latest: { USD: { valueDate: "2026-10-07", value: "967.79" } } });

    await run(handlerFor(repo, source));

    expect(repo.rows.get(`USD|${TODAY}`)).toEqual(entry("USD", TODAY, "967.79", "2026-10-07"));
    expect(repo.rows.get(`CLF|${TODAY}`)?.valueDate).toBe(TODAY);
  });

  it("(d) does nothing when today's real value is already stored for both currencies", async () => {
    const repo = fakeExchangeRateRepo([
      entry("USD", TODAY, "979.85"),
      entry("CLF", TODAY, "41122.74"),
    ]);
    const source = fakeSource();

    const result = await run(handlerFor(repo, source));

    expect(source.latest).not.toHaveBeenCalled();
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(result.outcome).toBe("complete");
  });

  it("(e) writes nothing and does not throw when the source is down", async () => {
    const repo = fakeExchangeRateRepo([
      entry("USD", "2026-10-07", "967.79"),
      entry("CLF", "2026-10-07", "41100"),
    ]);
    const before = repo.rows.size;

    const result = await run(handlerFor(repo, fakeSource({ failLatest: true })));

    expect(repo.rows.size).toBe(before);
    expect(result.outcome).toBe("unavailable");
  });

  it("(f) on the LAST tick of the day a dead source leaves today with the last known value, carried", async () => {
    const repo = fakeExchangeRateRepo([
      entry("USD", "2026-10-07", "967.79"),
      entry("CLF", "2026-10-07", "41100"),
    ]);

    const result = await run(handlerFor(repo, fakeSource({ failLatest: true })), MORNING, true);

    expect(repo.rows.get(`USD|${TODAY}`)).toEqual(entry("USD", TODAY, "967.79", "2026-10-07"));
    expect(repo.rows.get(`CLF|${TODAY}`)).toEqual(entry("CLF", TODAY, "41100", "2026-10-07"));
    expect(result.outcome).toBe("carried");
  });

  it("(f) an EARLIER tick with a dead source does not carry anything yet", async () => {
    const repo = fakeExchangeRateRepo([entry("USD", "2026-10-07", "967.79")]);

    await run(handlerFor(repo, fakeSource({ failLatest: true })), MORNING, false);

    expect(repo.rows.has(`USD|${TODAY}`)).toBe(false);
  });

  it("(f) the last tick carries the missing days too, and invents nothing on an empty table", async () => {
    const repo = fakeExchangeRateRepo([entry("USD", "2026-10-05", "984.82")]);

    await run(handlerFor(repo, fakeSource({ failLatest: true })), MORNING, true);

    for (const d of ["2026-10-06", "2026-10-07", TODAY]) {
      expect(repo.rows.get(`USD|${d}`)).toEqual(entry("USD", d, "984.82", "2026-10-05"));
    }

    const empty = fakeExchangeRateRepo();
    await run(handlerFor(empty, fakeSource({ failLatest: true })), MORNING, true);
    expect(empty.rows.size).toBe(0);
  });

  it("(g) a later successful run replaces the carried row with the real publication", async () => {
    const repo = fakeExchangeRateRepo([
      entry("USD", "2026-10-07", "967.79"),
      entry("USD", TODAY, "967.79", "2026-10-07"),
      entry("CLF", "2026-10-07", "41100"),
      entry("CLF", TODAY, "41122.74"),
    ]);

    await run(handlerFor(repo, fakeSource()));

    expect(repo.rows.get(`USD|${TODAY}`)).toEqual(entry("USD", TODAY, "979.85"));
  });

  it("(h) fills the days missing between the last stored one and today from the series", async () => {
    const repo = fakeExchangeRateRepo([
      entry("USD", "2026-10-03", "960"),
      entry("CLF", "2026-10-03", "41000"),
    ]);
    const series = [
      { valueDate: "2026-10-02", value: "960" },
      { valueDate: "2026-10-05", value: "984.82" },
      { valueDate: "2026-10-06", value: "977.25" },
      { valueDate: "2026-10-07", value: "967.79" },
    ];
    const source = fakeSource({ series: { USD: series, CLF: series } });

    await run(handlerFor(repo, source));

    expect(repo.rows.get("USD|2026-10-04")).toEqual(
      entry("USD", "2026-10-04", "960", "2026-10-02"),
    );
    expect(repo.rows.get("USD|2026-10-05")).toEqual(entry("USD", "2026-10-05", "984.82"));
    expect(repo.rows.get("USD|2026-10-07")).toEqual(entry("USD", "2026-10-07", "967.79"));
    expect(repo.rows.get(`USD|${TODAY}`)).toEqual(entry("USD", TODAY, "979.85"));
  });

  it("still records today when only the history call fails", async () => {
    const repo = fakeExchangeRateRepo([entry("USD", "2026-10-03", "960")]);

    await run(handlerFor(repo, fakeSource({ failSeries: true })));

    expect(repo.rows.get(`USD|${TODAY}`)).toEqual(entry("USD", TODAY, "979.85"));
  });
});
