import { Module } from "@nestjs/common";

import { ACCOUNT_CREDIT_LIMIT_REPOSITORY } from "./domain/ports/account-credit-limit.repository.port";
import { ACCOUNT_CREDIT_LIMIT_CURRENCY_USAGE } from "./domain/ports/currency-usage-lookup.port";
import { PrismaAccountCreditLimitCurrencyUsageLookupRepository } from "./infrastructure/prisma-account-credit-limit-currency-usage-lookup.repository";
import { PrismaAccountCreditLimitRepository } from "./infrastructure/prisma-account-credit-limit.repository";

/**
 * Data module for the `account-credit-limit` table (spec 039). A LEAF: it provides one
 * table's port→adapter binding and imports no other domain.
 */
@Module({
  providers: [
    { provide: ACCOUNT_CREDIT_LIMIT_REPOSITORY, useClass: PrismaAccountCreditLimitRepository },
    {
      provide: ACCOUNT_CREDIT_LIMIT_CURRENCY_USAGE,
      useClass: PrismaAccountCreditLimitCurrencyUsageLookupRepository,
    },
  ],
  exports: [ACCOUNT_CREDIT_LIMIT_REPOSITORY, ACCOUNT_CREDIT_LIMIT_CURRENCY_USAGE],
})
export class AccountCreditLimitDataModule {}
