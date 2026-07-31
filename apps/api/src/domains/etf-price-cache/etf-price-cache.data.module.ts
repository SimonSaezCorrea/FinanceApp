import { Module } from "@nestjs/common";

import { ETF_PRICE_CACHE_REPOSITORY } from "./domain/ports/etf-price-cache.repository.port";
import { PrismaEtfPriceCacheRepository } from "./infrastructure/prisma-etf-price-cache.repository";

/** Leaf data module for the `etf-price-cache` table (unused until the live ETF
 * quote feature is implemented — see the port's docblock). */
@Module({
  providers: [{ provide: ETF_PRICE_CACHE_REPOSITORY, useClass: PrismaEtfPriceCacheRepository }],
  exports: [ETF_PRICE_CACHE_REPOSITORY],
})
export class EtfPriceCacheDataModule {}
