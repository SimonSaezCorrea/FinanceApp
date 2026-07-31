import { Module } from "@nestjs/common";

import { COUNTRY_LOOKUP } from "./domain/ports/country-lookup.port";
import { PrismaCountryLookupRepository } from "./infrastructure/prisma-country-lookup.repository";

/** Leaf data module for the `country` table. */
@Module({
  providers: [{ provide: COUNTRY_LOOKUP, useClass: PrismaCountryLookupRepository }],
  exports: [COUNTRY_LOOKUP],
})
export class CountryDataModule {}
