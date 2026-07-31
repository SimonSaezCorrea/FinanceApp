import { Module } from "@nestjs/common";

import { COUNTRY_CURRENCY_REPOSITORY } from "./domain/ports/country-currency.repository.port";
import { PrismaCountryCurrencyRepository } from "./infrastructure/prisma-country-currency.repository";

/** Leaf data module for the `country-currency` join table (seeded; no HTTP
 * surface yet — see the port's docblock). */
@Module({
  providers: [{ provide: COUNTRY_CURRENCY_REPOSITORY, useClass: PrismaCountryCurrencyRepository }],
  exports: [COUNTRY_CURRENCY_REPOSITORY],
})
export class CountryCurrencyDataModule {}
