import { Module } from "@nestjs/common";

import { DEBT_CURRENCY_USAGE } from "./domain/ports/currency-usage-lookup.port";
import { DEBT_REPOSITORY } from "./domain/ports/debt.repository.port";
import { PrismaDebtCurrencyUsageLookupRepository } from "./infrastructure/prisma-debt-currency-usage-lookup.repository";
import { PrismaDebtRepository } from "./infrastructure/prisma-debt.repository";

/**
 * Leaf data module for the `debt` table: the aggregate's port→adapter binding
 * only, no controller/handlers — so other domains (e.g. `user`, for the
 * currency-in-use lookup) can depend on the debt repository without pulling
 * in `DebtModule`'s full orchestration graph, which is what keeps the module
 * graph acyclic (specs/020).
 */
@Module({
  providers: [
    { provide: DEBT_REPOSITORY, useClass: PrismaDebtRepository },
    { provide: DEBT_CURRENCY_USAGE, useClass: PrismaDebtCurrencyUsageLookupRepository },
  ],
  exports: [DEBT_REPOSITORY, DEBT_CURRENCY_USAGE],
})
export class DebtDataModule {}
