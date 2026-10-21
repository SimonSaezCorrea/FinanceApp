import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadRatesSnapshot } from "./exchangeRates";

const FIXTURE = join(import.meta.dirname, "..", "..", "test", "fixtures", "rates-snapshot.json");

const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 })) as Promise<Response>;

describe("loadRatesSnapshot (build time, spec 033 R2)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the fixture when EXCHANGE_RATES_SNAPSHOT points at one, without calling the API", async () => {
    const fetcher = vi.fn();
    const snap = await loadRatesSnapshot({ snapshotPath: FIXTURE, fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    expect(snap?.today).toBe("2026-10-21");
    expect(snap?.latest.CLF?.value).toBe("39882.6800");
    expect(snap?.first.USD).toBe("2025-09-17");
  });

  it("asks the public endpoint for the last 365 days of both currencies", async () => {
    const fetcher = vi.fn(() =>
      ok({ items: [], latest: { USD: null, CLF: null }, first: { USD: null, CLF: null } }),
    );
    const snap = await loadRatesSnapshot({
      apiUrl: "https://api.example",
      today: "2026-10-21",
      fetcher,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example/api/v1/public/exchange-rates?from=2025-10-21&to=2026-10-21",
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(snap).toEqual({
      today: "2026-10-21",
      items: [],
      latest: { USD: null, CLF: null },
      first: { USD: null, CLF: null },
    });
  });

  it("answers null on a non-2xx, a network error or a malformed body", async () => {
    const opts = { apiUrl: "https://api.example", today: "2026-10-21" };
    expect(
      await loadRatesSnapshot({
        ...opts,
        fetcher: () => Promise.resolve(new Response("", { status: 500 })),
      }),
    ).toBeNull();
    expect(
      await loadRatesSnapshot({ ...opts, fetcher: () => Promise.reject(new Error("down")) }),
    ).toBeNull();
    expect(await loadRatesSnapshot({ ...opts, fetcher: () => ok({ items: "nope" }) })).toBeNull();
  });

  it("throws instead of answering null when the data is required (the scheduled rebuild)", async () => {
    await expect(
      loadRatesSnapshot({
        apiUrl: "https://api.example",
        today: "2026-10-21",
        required: true,
        fetcher: () => Promise.reject(new Error("down")),
      }),
    ).rejects.toThrow(/exchange rates/i);
  });
});
