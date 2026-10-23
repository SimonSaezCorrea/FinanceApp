import { describe, expect, it, vi } from "vitest";

import {
  ExchangeRateSourceUnavailableError,
  type ExchangeRateSourcePort,
} from "../../../../../src/domains/exchange-rate/application/exchange-rate-source";
import { FallbackExchangeRateSource } from "../../../../../src/domains/exchange-rate/infrastructure/fallback-source";

const LATEST = {
  USD: { valueDate: "2026-10-22", value: "976.82" },
  CLF: { valueDate: "2026-10-22", value: "41199.85" },
};

function fake(fail: boolean): ExchangeRateSourcePort {
  return {
    latest: vi.fn(async () => {
      if (fail) throw new ExchangeRateSourceUnavailableError("down");
      return LATEST;
    }),
    series: vi.fn(async () => {
      if (fail) throw new ExchangeRateSourceUnavailableError("down");
      return [LATEST.USD];
    }),
  };
}

describe("FallbackExchangeRateSource", () => {
  it("uses the first source while it answers, never asking the next", async () => {
    const primary = fake(false);
    const backup = fake(false);
    const source = new FallbackExchangeRateSource([primary, backup]);
    await expect(source.latest()).resolves.toEqual(LATEST);
    await expect(source.series("USD", 2026)).resolves.toEqual([LATEST.USD]);
    expect(backup.latest).not.toHaveBeenCalled();
    expect(backup.series).not.toHaveBeenCalled();
  });

  it("falls back to the next source when the first is unavailable", async () => {
    const backup = fake(false);
    const source = new FallbackExchangeRateSource([fake(true), backup]);
    await expect(source.latest()).resolves.toEqual(LATEST);
    await expect(source.series("CLF", 2026)).resolves.toEqual([LATEST.USD]);
  });

  it("is unavailable only when every source is", async () => {
    const source = new FallbackExchangeRateSource([fake(true), fake(true)]);
    await expect(source.latest()).rejects.toBeInstanceOf(ExchangeRateSourceUnavailableError);
    await expect(source.series("USD", 2026)).rejects.toBeInstanceOf(
      ExchangeRateSourceUnavailableError,
    );
  });

  it("does not hide a programming error behind a fallback", async () => {
    const broken: ExchangeRateSourcePort = {
      latest: vi.fn(async () => {
        throw new TypeError("bug");
      }),
      series: vi.fn(),
    };
    const source = new FallbackExchangeRateSource([broken, fake(false)]);
    await expect(source.latest()).rejects.toBeInstanceOf(TypeError);
  });
});
