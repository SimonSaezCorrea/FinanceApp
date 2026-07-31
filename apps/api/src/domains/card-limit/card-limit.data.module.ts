import { Module } from "@nestjs/common";

import { CARD_LIMIT_REPOSITORY } from "./domain/ports/card-limit.repository.port";
import { PrismaCardLimitRepository } from "./infrastructure/prisma-card-limit.repository";

/**
 * Data module for the `card-limit` table. A `*.data.module.ts` is a LEAF: it
 * provides one table's port→adapter binding and imports no other domain, which
 * is what keeps the one-table-one-domain split free of circular module graphs
 * (orchestration modules import leaves, never the other way round).
 */
@Module({
  providers: [{ provide: CARD_LIMIT_REPOSITORY, useClass: PrismaCardLimitRepository }],
  exports: [CARD_LIMIT_REPOSITORY],
})
export class CardLimitDataModule {}
