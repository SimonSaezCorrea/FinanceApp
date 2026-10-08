import { Module } from "@nestjs/common";

import { EXCHANGE_RATE_REPOSITORY } from "./domain/ports/exchange-rate.repository.port";
import { PrismaExchangeRateRepository } from "./infrastructure/prisma-exchange-rate.repository";

/**
 * Leaf data module for the `exchange-rate` table: exports only the port→adapter binding and
 * imports no other domain, so any domain that later needs a rate server-side can depend on it
 * without a cycle (orchestration depends on leaves, never the reverse — Principle VI).
 */
@Module({
  providers: [{ provide: EXCHANGE_RATE_REPOSITORY, useClass: PrismaExchangeRateRepository }],
  exports: [EXCHANGE_RATE_REPOSITORY],
})
export class ExchangeRateDataModule {}
