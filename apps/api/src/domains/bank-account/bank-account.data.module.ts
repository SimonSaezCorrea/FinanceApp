import { Module } from "@nestjs/common";

import { BillingSettingsDataModule } from "../billing-settings/billing-settings.data.module";
import { CardAccountDataModule } from "../card-account/card-account.data.module";
import { FinancialInstitutionDataModule } from "../financial-institution/financial-institution.data.module";
import { BANK_ACCOUNT_REPOSITORY } from "./domain/ports/bank-account.repository.port";
import { PrismaBankAccountRepository } from "./infrastructure/prisma-bank-account.repository";

/**
 * Leaf data module for the `bank-account` table: the aggregate's port→adapter
 * binding plus the child-table leaves its adapter composes. Split out of
 * `BankAccountModule` (the orchestration side) so other domains —
 * `credit-statement`, and later `transaction`/`wallet-item-dashboard` — can
 * depend on the account repository without importing its controller/handlers,
 * which is what keeps the module graph acyclic.
 */
@Module({
  imports: [CardAccountDataModule, BillingSettingsDataModule, FinancialInstitutionDataModule],
  providers: [{ provide: BANK_ACCOUNT_REPOSITORY, useClass: PrismaBankAccountRepository }],
  exports: [BANK_ACCOUNT_REPOSITORY],
})
export class BankAccountDataModule {}
