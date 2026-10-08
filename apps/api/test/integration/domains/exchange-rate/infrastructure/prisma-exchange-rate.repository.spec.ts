import { ConfigService } from "@nestjs/config";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { PrismaExchangeRateRepository } from "../../../../../src/domains/exchange-rate/infrastructure/prisma-exchange-rate.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/** Global table (no `userId`). Years 2001/2099 can never collide with a real recording, and
 * cleanup is a single `deleteMany` over that window. */
const FAR_PAST = "2001-01-";
const FAR_FUTURE = "2099-01-";

describe("PrismaExchangeRateRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaExchangeRateRepository(prisma);

  const clean = () =>
    prisma.exchangeRate.deleteMany({
      where: {
        OR: [
          { date: { gte: new Date("2001-01-01"), lt: new Date("2001-02-01") } },
          { date: { gte: new Date("2099-01-01"), lt: new Date("2099-02-01") } },
        ],
      },
    });

  beforeAll(async () => {
    await prisma.$connect();
    await clean();
  });

  afterEach(clean);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("upsert twice for the same (currency, date) leaves ONE row, and the real value replaces the carried one", async () => {
    const date = `${FAR_PAST}10`;
    await repo.upsert({ currency: "USD", date, value: "900.0000", valueDate: `${FAR_PAST}08` });
    await repo.upsert({ currency: "USD", date, value: "905.5000", valueDate: date });

    const rows = await repo.findRange("USD", date, date);
    expect(rows).toEqual([{ currency: "USD", date, value: "905.5000", valueDate: date }]);
    expect(await prisma.exchangeRate.count({ where: { date: new Date(date) } })).toBe(1);
  });

  it("never moves valueDate backwards: a stale carried write cannot undo a real publication", async () => {
    const date = `${FAR_PAST}11`;
    await repo.upsert({ currency: "USD", date, value: "905.5000", valueDate: date });
    await repo.upsert({ currency: "USD", date, value: "900.0000", valueDate: `${FAR_PAST}08` });

    const [row] = await repo.findRange("USD", date, date);
    expect(row).toEqual({ currency: "USD", date, value: "905.5000", valueDate: date });
  });

  it("keeps USD and CLF apart on the same day", async () => {
    const date = `${FAR_PAST}12`;
    await repo.upsertMany([
      { currency: "USD", date, value: "950.0000", valueDate: date },
      { currency: "CLF", date, value: "41000.0000", valueDate: date },
    ]);

    expect(await repo.findRange("USD", date, date)).toHaveLength(1);
    expect(await repo.findRange("CLF", date, date)).toHaveLength(1);
    expect(await repo.findRange(undefined, date, date)).toHaveLength(2);
  });

  it("findRange is ordered newest first and bounded on both ends", async () => {
    await repo.upsertMany(
      ["01", "02", "03", "04", "05"].map((d) => ({
        currency: "USD" as const,
        date: `${FAR_PAST}${d}`,
        value: "900.0000",
        valueDate: `${FAR_PAST}${d}`,
      })),
    );

    const rows = await repo.findRange("USD", `${FAR_PAST}02`, `${FAR_PAST}04`);
    expect(rows.map((r) => r.date)).toEqual([`${FAR_PAST}04`, `${FAR_PAST}03`, `${FAR_PAST}02`]);
  });

  it("findLatest returns the newest row of that currency only", async () => {
    await repo.upsertMany([
      { currency: "CLF", date: `${FAR_FUTURE}05`, value: "99999.0000", valueDate: `${FAR_FUTURE}05` },
      { currency: "USD", date: `${FAR_FUTURE}06`, value: "99998.0000", valueDate: `${FAR_FUTURE}06` },
    ]);

    expect((await repo.findLatest("CLF"))?.date).toBe(`${FAR_FUTURE}05`);
    expect((await repo.findLatest("USD"))?.date).toBe(`${FAR_FUTURE}06`);
    expect(await repo.lastDate("CLF")).toBe(`${FAR_FUTURE}05`);
  });

  it("a date column round-trips as a plain calendar day, whatever the server's time zone", async () => {
    const date = `${FAR_PAST}20`;
    await repo.upsert({ currency: "USD", date, value: "1.0000", valueDate: date });
    const [row] = await repo.findRange("USD", date, date);
    expect(row?.date).toBe(date);
    expect(row?.valueDate).toBe(date);
  });
});
