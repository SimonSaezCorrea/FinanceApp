import { Module } from "@nestjs/common";

import { CardLimitDataModule } from "../card-limit/card-limit.data.module";
import { CARD_ACCOUNT_REPOSITORY } from "./domain/ports/card-account.repository.port";
import { PrismaCardAccountRepository } from "./infrastructure/prisma-card-account.repository";

/**
 * Leaf data module for the `card-account` table. Imports only another leaf
 * (`card-limit`), so the graph stays acyclic: card-limit ← card-account ←
 * bank-account (orchestration).
 */
@Module({
  imports: [CardLimitDataModule],
  providers: [{ provide: CARD_ACCOUNT_REPOSITORY, useClass: PrismaCardAccountRepository }],
  exports: [CARD_ACCOUNT_REPOSITORY],
})
export class CardAccountDataModule {}
