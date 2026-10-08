import { ConfigService } from "@nestjs/config";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { RecordExchangeRatesCommand } from "../../../../../src/domains/exchange-rate/application/commands/record-exchange-rates.command";
import { RecordExchangeRatesHandler } from "../../../../../src/domains/exchange-rate/application/commands/record-exchange-rates.handler";
import type { ExchangeRateSourcePort } from "../../../../../src/domains/exchange-rate/application/exchange-rate-source";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";
import { buildExchangeRateRepo } from "../../../support/repositories";

/** A "today" nobody records for real: year 2099 keeps this suite's rows disjoint from the
 * dev database's real history, and cleanup a single `deleteMany`. */
const NOW = new Date("2099-01-15T11:00:00Z"); // 08:00 in Chile (UTC-3)
const TODAY = "2099-01-15";

describe("RecordExchangeRatesHandler (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = buildExchangeRateRepo(prisma);

  const clean = () =>
    prisma.exchangeRate.deleteMany({
      where: { date: { gte: new Date("2098-01-01"), lt: new Date("2100-01-01") } },
    });

  const source: ExchangeRateSourcePort = {
    latest: vi.fn(async () => ({
      USD: { valueDate: TODAY, value: "979.85" },
      CLF: { valueDate: TODAY, value: "41122.74" },
    })),
    series: vi.fn(async () => []),
  };

  const makeHandler = () => new RecordExchangeRatesHandler({ publish: vi.fn() } as never, repo, source);

  beforeAll(async () => {
    await prisma.$connect();
    await clean();
    // Yesterday exists, so the run has no history gap to fill and never touches the real table.
    await repo.upsertMany([
      { currency: "USD", date: "2099-01-14", value: "970.0000", valueDate: "2099-01-14" },
      { currency: "CLF", date: "2099-01-14", value: "41000.0000", valueDate: "2099-01-14" },
    ]);
  });

  afterEach(async () => {
    await prisma.exchangeRate.deleteMany({ where: { date: new Date(TODAY) } });
  });

  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("two ticks racing for the same day leave exactly one row per currency (the unique key is the guard)", async () => {
    await Promise.all([
      makeHandler().execute(new RecordExchangeRatesCommand(NOW, false)),
      makeHandler().execute(new RecordExchangeRatesCommand(NOW, false)),
      makeHandler().execute(new RecordExchangeRatesCommand(NOW, false)),
    ]);

    const rows = await prisma.exchangeRate.findMany({ where: { date: new Date(TODAY) } });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.currency).sort()).toEqual(["CLF", "USD"]);
    expect(rows.find((r) => r.currency === "USD")?.value.toFixed(2)).toBe("979.85");
  });

  it("a run after the day is complete does not call the source again", async () => {
    await makeHandler().execute(new RecordExchangeRatesCommand(NOW, false));
    vi.mocked(source.latest).mockClear();

    const result = await makeHandler().execute(new RecordExchangeRatesCommand(NOW, false));

    expect(result.outcome).toBe("complete");
    expect(source.latest).not.toHaveBeenCalled();
  });

  it("a real publication that arrives later replaces the carried row in the table", async () => {
    vi.mocked(source.latest).mockResolvedValueOnce({
      USD: { valueDate: "2099-01-14", value: "970.00" },
      CLF: { valueDate: TODAY, value: "41122.74" },
    });
    await makeHandler().execute(new RecordExchangeRatesCommand(NOW, false));
    const carried = await prisma.exchangeRate.findFirst({
      where: { currency: "USD", date: new Date(TODAY) },
    });
    expect(carried?.valueDate.toISOString().slice(0, 10)).toBe("2099-01-14");

    await makeHandler().execute(new RecordExchangeRatesCommand(NOW, false));

    const real = await prisma.exchangeRate.findFirst({
      where: { currency: "USD", date: new Date(TODAY) },
    });
    expect(real?.valueDate.toISOString().slice(0, 10)).toBe(TODAY);
    expect(real?.value.toFixed(2)).toBe("979.85");
  });
});
