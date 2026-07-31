import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type {
  EtfPriceCacheRepositoryPort,
  EtfQuoteRow,
} from "../domain/ports/etf-price-cache.repository.port";

/** Adapter — the ONLY file that touches `prisma.etfPriceCache`. */
@Injectable()
export class PrismaEtfPriceCacheRepository implements EtfPriceCacheRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async find(symbol: string): Promise<EtfQuoteRow | null> {
    const row = await this.prisma.etfPriceCache.findUnique({ where: { symbol } });
    if (!row) return null;
    return {
      symbol: row.symbol,
      fetchedAt: row.fetchedAt,
      open: row.open.toString(),
      high: row.high.toString(),
      low: row.low.toString(),
      close: row.close.toString(),
      volume: row.volume?.toString() ?? null,
      rawJson: row.rawJson,
    };
  }

  async upsert(row: EtfQuoteRow): Promise<void> {
    const data = {
      fetchedAt: row.fetchedAt,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    };
    await this.prisma.etfPriceCache.upsert({
      where: { symbol: row.symbol },
      create: { symbol: row.symbol, ...data },
      update: data,
    });
  }
}
