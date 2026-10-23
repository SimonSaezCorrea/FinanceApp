import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExchangeRateSourceUnavailableError } from "../../../../../src/domains/exchange-rate/application/exchange-rate-source";
import { BcchSource } from "../../../../../src/domains/exchange-rate/infrastructure/bcch-source";

const respond = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

const obs = (date: string, value: string, statusCode = "OK") => ({
  indexDateString: date,
  value,
  statusCode,
});
const answer = (series: string, observations: unknown[]) => ({
  Codigo: 0,
  Descripcion: "Success",
  Series: { seriesId: series, Obs: observations },
  SeriesInfos: [],
});

const source = () => new BcchSource(new ConfigService({ BCCH_API_TOKEN: "secret-token" }));

describe("BcchSource (Banco Central de Chile, BDE REST)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reads a yearly series: DD-MM-YYYY dates, decimal strings, days without data skipped", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        respond(
          answer("F073.TCO.PRE.Z.D", [
            obs("21-10-2026", "978.56"),
            obs("22-10-2026", "976.82"),
            obs("24-10-2026", "NaN", "ND"),
          ]),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(source().series("USD", 2026)).resolves.toEqual([
      { valueDate: "2026-10-21", value: "978.56" },
      { valueDate: "2026-10-22", value: "976.82" },
    ]);
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe("https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx");
    expect(url.searchParams.get("token")).toBe("secret-token");
    expect(url.searchParams.get("function")).toBe("GetSeries");
    expect(url.searchParams.get("timeseries")).toBe("F073.TCO.PRE.Z.D");
    expect(url.searchParams.get("firstdate")).toBe("2026-01-01");
    expect(url.searchParams.get("lastdate")).toBe("2026-12-31");
  });

  it("asks for the UF series for CLF", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(answer("F073.UFF.PRE.Z.D", [])));
    vi.stubGlobal("fetch", fetchMock);
    await source().series("CLF", 2026);
    expect(new URL(fetchMock.mock.calls[0]![0] as string).searchParams.get("timeseries")).toBe(
      "F073.UFF.PRE.Z.D",
    );
  });

  it("latest() is the value published on or before today in Chile (the UF comes ahead)", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-22T15:00:00Z") });
    const fetchMock = vi.fn(async (url: string) => {
      const series = new URL(url).searchParams.get("timeseries");
      return series === "F073.UFF.PRE.Z.D"
        ? respond(
            answer(series, [
              obs("22-10-2026", "41199.85"),
              obs("23-10-2026", "41205.16"),
              obs("09-11-2026", "41295.46"),
            ]),
          )
        : respond(answer(series!, [obs("21-10-2026", "978.56"), obs("22-10-2026", "976.82")]));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(source().latest()).resolves.toEqual({
      USD: { valueDate: "2026-10-22", value: "976.82" },
      CLF: { valueDate: "2026-10-22", value: "41199.85" },
    });
  });

  it.each([
    ["an error code from the service", () => respond({ Codigo: -5, Descripcion: "Invalid user" })],
    ["a missing Obs list", () => respond({ Codigo: 0, Series: {} })],
    ["an unreadable date", () => respond(answer("x", [obs("2026/10/22", "1")]))],
    ["a non-numeric OK value", () => respond(answer("x", [obs("22-10-2026", "abc")]))],
  ])("throws ExchangeRateSourceUnavailableError on %s", async (_label, make) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(make()));
    await expect(source().series("USD", 2026)).rejects.toBeInstanceOf(
      ExchangeRateSourceUnavailableError,
    );
  });

  it("latest() fails when there is no value up to today", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-22T15:00:00Z") });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(answer("x", []))));
    await expect(source().latest()).rejects.toBeInstanceOf(ExchangeRateSourceUnavailableError);
  });
});
