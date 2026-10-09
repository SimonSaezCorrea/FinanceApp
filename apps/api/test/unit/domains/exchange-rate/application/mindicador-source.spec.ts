import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExchangeRateSourceUnavailableError } from "../../../../../src/domains/exchange-rate/application/exchange-rate-source";
import { MindicadorSource } from "../../../../../src/domains/exchange-rate/infrastructure/mindicador-source";

const respond = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

const LATEST = {
  version: "1.7.0",
  fecha: "2026-10-08T19:00:00.000Z",
  uf: { codigo: "uf", fecha: "2026-10-08T03:00:00.000Z", valor: 41122.74 },
  dolar: { codigo: "dolar", fecha: "2026-10-07T03:00:00.000Z", valor: 967.79 },
  euro: { codigo: "euro", fecha: "2026-10-08T03:00:00.000Z", valor: 1100 },
};

function source(url?: string) {
  const config = new ConfigService(url ? { EXCHANGE_RATE_SOURCE_URL: url } : {});
  return new MindicadorSource(config);
}

describe("MindicadorSource", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the latest dólar and UF from one call, taking the UTC date of `fecha`", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(LATEST));
    vi.stubGlobal("fetch", fetchMock);

    const latest = await source().latest();

    expect(latest).toEqual({
      USD: { valueDate: "2026-10-07", value: "967.79" },
      CLF: { valueDate: "2026-10-08", value: "41122.74" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://mindicador.cl/api");
  });

  it("keeps the exact decimals of the quote (no float round-trip)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          respond({ ...LATEST, dolar: { fecha: "2026-10-08T03:00:00.000Z", valor: 979.85 } }),
        ),
    );

    expect((await source().latest()).USD.value).toBe("979.85");
  });

  it("reads a yearly series per indicator, future-dated entries included", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respond({
        serie: [
          { fecha: "2026-10-09T03:00:00.000Z", valor: 41130.1 },
          { fecha: "2026-10-08T03:00:00.000Z", valor: 41122.74 },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const series = await source().series("CLF", 2026);

    expect(series).toEqual([
      { valueDate: "2026-10-09", value: "41130.1" },
      { valueDate: "2026-10-08", value: "41122.74" },
    ]);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://mindicador.cl/api/uf/2026");
  });

  it("uses dolar for USD in the series path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond({ serie: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await source().series("USD", 2025);

    expect(fetchMock.mock.calls[0]![0]).toBe("https://mindicador.cl/api/dolar/2025");
  });

  it("honours an overridden base URL (used by tests and staging)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(LATEST));
    vi.stubGlobal("fetch", fetchMock);

    await source("http://localhost:9999/api").latest();

    expect(fetchMock.mock.calls[0]![0]).toBe("http://localhost:9999/api");
  });

  it.each([
    ["a non-2xx status", () => vi.fn().mockResolvedValue(respond({}, false, 503))],
    ["a network failure", () => vi.fn().mockRejectedValue(new TypeError("fetch failed"))],
    ["a timeout", () => vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError"))],
    [
      "invalid JSON",
      () =>
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("bad json");
          },
        }),
    ],
    ["a missing indicator", () => vi.fn().mockResolvedValue(respond({ ...LATEST, uf: undefined }))],
    [
      "a non-numeric value",
      () =>
        vi
          .fn()
          .mockResolvedValue(
            respond({ ...LATEST, dolar: { fecha: "2026-10-08T03:00:00.000Z", valor: "n/a" } }),
          ),
    ],
  ])("throws ExchangeRateSourceUnavailableError on %s, never partial data", async (_l, make) => {
    vi.stubGlobal("fetch", make());

    await expect(source().latest()).rejects.toBeInstanceOf(ExchangeRateSourceUnavailableError);
  });

  it("throws on a series with an unreadable entry instead of skipping it silently", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respond({ serie: [{ fecha: "not a date", valor: 1 }] })),
    );

    await expect(source().series("USD", 2026)).rejects.toBeInstanceOf(
      ExchangeRateSourceUnavailableError,
    );
  });
});
