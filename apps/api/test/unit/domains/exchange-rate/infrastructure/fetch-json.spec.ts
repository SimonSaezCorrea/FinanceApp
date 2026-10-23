import { describe, expect, it, vi } from "vitest";

import { ExchangeRateSourceUnavailableError } from "../../../../../src/domains/exchange-rate/application/exchange-rate-source";
import { fetchJson } from "../../../../../src/domains/exchange-rate/infrastructure/fetch-json";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const status = (code: number) => ({ ok: false, status: code, json: async () => ({}) }) as Response;
const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");
const noWait = { retryDelayMs: 0 };

describe("fetchJson (exchange-rate sources)", () => {
  it("returns the parsed body on the first good answer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ a: 1 }));
    await expect(fetchJson("https://x", { ...noWait, fetchImpl })).resolves.toEqual({ a: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a timeout and takes the answer of the next attempt (the 2026-10-22 failure)", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce(ok({ a: 2 }));
    await expect(fetchJson("https://x", { ...noWait, fetchImpl })).resolves.toEqual({ a: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a 5xx and a network error", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(status(503))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ok({ a: 3 }));
    await expect(fetchJson("https://x", { ...noWait, attempts: 3, fetchImpl })).resolves.toEqual({
      a: 3,
    });
  });

  it("does not retry a 4xx: asking again cannot fix it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(status(401));
    await expect(fetchJson("https://x", { ...noWait, fetchImpl })).rejects.toBeInstanceOf(
      ExchangeRateSourceUnavailableError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up after the last attempt with a source-unavailable error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(timeout());
    await expect(fetchJson("https://x", { ...noWait, attempts: 2, fetchImpl })).rejects.toThrow(
      /timeout/i,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("treats unreadable JSON as unavailable, without retrying", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("bad");
      },
    } as unknown as Response);
    await expect(fetchJson("https://x", { ...noWait, fetchImpl })).rejects.toBeInstanceOf(
      ExchangeRateSourceUnavailableError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
