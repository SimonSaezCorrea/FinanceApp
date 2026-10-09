import { Injectable } from "@nestjs/common";

import { generateRowId } from "../../../infra/id/generate-row-id";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { ExchangeRateEntry, RateCurrency } from "../domain/exchange-rate.entity";
import type { ExchangeRateRepositoryPort } from "../domain/ports/exchange-rate.repository.port";

interface Row {
  currency: string;
  date: Date;
  value: { toFixed(dp: number): string };
  valueDate: Date;
}

const day = (d: Date): string => d.toISOString().slice(0, 10);

function toEntry(row: Row): ExchangeRateEntry {
  return {
    currency: row.currency as RateCurrency,
    date: day(row.date),
    value: row.value.toFixed(4),
    valueDate: day(row.valueDate),
  };
}

/** Adapter (Principle VI) — the ONLY file allowed to import `@prisma/client` for the
 * `exchange-rate` table. `date`/`valueDate` are Postgres `date` columns: they cross this
 * boundary as `YYYY-MM-DD` strings so no time zone can shift a calendar day. */
@Injectable()
export class PrismaExchangeRateRepository implements ExchangeRateRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(entry: ExchangeRateEntry): Promise<void> {
    await this.upsertWith(this.prisma, entry);
  }

  async upsertMany(entries: readonly ExchangeRateEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      for (const entry of entries) await this.upsertWith(tx, entry);
    });
  }

  /** One atomic statement, so a concurrent writer can neither duplicate the row nor let an
   * older publication overwrite a newer one: the update only applies when it does not lower
   * `valueDate` (a carried value never replaces the real one). */
  private async upsertWith(
    client: Pick<PrismaService, "$executeRaw">,
    e: ExchangeRateEntry,
  ): Promise<void> {
    await client.$executeRaw`
      INSERT INTO "exchange-rate" ("id", "currency", "date", "value", "valueDate", "createdAt", "updatedAt")
      VALUES (${generateRowId()}, ${e.currency}, ${e.date}::date, ${e.value}::numeric, ${e.valueDate}::date, now(), now())
      ON CONFLICT ("currency", "date") DO UPDATE
        SET "value" = EXCLUDED."value", "valueDate" = EXCLUDED."valueDate", "updatedAt" = now()
        WHERE EXCLUDED."valueDate" >= "exchange-rate"."valueDate"`;
  }

  async findLatest(currency: RateCurrency): Promise<ExchangeRateEntry | null> {
    const row = await this.prisma.exchangeRate.findFirst({
      where: { currency },
      orderBy: { date: "desc" },
    });
    return row ? toEntry(row) : null;
  }

  async findRange(
    currency: RateCurrency | undefined,
    from: string,
    to: string,
  ): Promise<ExchangeRateEntry[]> {
    const rows = await this.prisma.exchangeRate.findMany({
      where: {
        ...(currency ? { currency } : {}),
        date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
      },
      orderBy: [{ date: "desc" }, { currency: "asc" }],
    });
    return rows.map(toEntry);
  }

  async lastDate(currency: RateCurrency): Promise<string | null> {
    const latest = await this.findLatest(currency);
    return latest ? latest.date : null;
  }
}
