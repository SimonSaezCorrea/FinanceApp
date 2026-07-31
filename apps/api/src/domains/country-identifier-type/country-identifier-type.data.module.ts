import { Module } from "@nestjs/common";

import { COUNTRY_IDENTIFIER_TYPE_REPOSITORY } from "./domain/ports/country-identifier-type.repository.port";
import { PrismaCountryIdentifierTypeRepository } from "./infrastructure/prisma-country-identifier-type.repository";

/** Leaf data module for the `country-identifier-type` join table. */
@Module({
  providers: [
    { provide: COUNTRY_IDENTIFIER_TYPE_REPOSITORY, useClass: PrismaCountryIdentifierTypeRepository },
  ],
  exports: [COUNTRY_IDENTIFIER_TYPE_REPOSITORY],
})
export class CountryIdentifierTypeDataModule {}
