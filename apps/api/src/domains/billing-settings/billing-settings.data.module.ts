import { Module } from "@nestjs/common";

import { BILLING_SETTINGS_REPOSITORY } from "./domain/ports/billing-settings.repository.port";
import { PrismaBillingSettingsRepository } from "./infrastructure/prisma-billing-settings.repository";

/** Leaf data module for the `billing-settings` table (see CardLimitDataModule). */
@Module({
  providers: [{ provide: BILLING_SETTINGS_REPOSITORY, useClass: PrismaBillingSettingsRepository }],
  exports: [BILLING_SETTINGS_REPOSITORY],
})
export class BillingSettingsDataModule {}
