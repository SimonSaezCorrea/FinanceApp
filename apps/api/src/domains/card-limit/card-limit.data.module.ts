import { Module } from "@nestjs/common";

import { CARD_LIMIT_CURRENCY_USAGE } from "./domain/ports/currency-usage-lookup.port";
import { CARD_LIMIT_REPOSITORY } from "./domain/ports/card-limit.repository.port";
import { PrismaCardLimitCurrencyUsageLookupRepository } from "./infrastructure/prisma-card-limit-currency-usage-lookup.repository";
import { PrismaCardLimitRepository } from "./infrastructure/prisma-card-limit.repository";

/**
 * Data module for the `card-limit` table. A `*.data.module.ts` is a LEAF: it
 * provides one table's port→adapter binding and imports no other domain, which
 * is what keeps the one-table-one-domain split free of circular module graphs
 * (orchestration modules import leaves, never the other way round).
 */
@Module({
  providers: [
    { provide: CARD_LIMIT_REPOSITORY, useClass: PrismaCardLimitRepository },
    { provide: CARD_LIMIT_CURRENCY_USAGE, useClass: PrismaCardLimitCurrencyUsageLookupRepository },
  ],
  exports: [CARD_LIMIT_REPOSITORY, CARD_LIMIT_CURRENCY_USAGE],
})
export class CardLimitDataModule {}
