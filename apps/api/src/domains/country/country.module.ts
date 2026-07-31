import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { CountryIdentifierTypeDataModule } from "../country-identifier-type/country-identifier-type.data.module";
import { ListCountriesQueryHandler } from "./application/queries/list-countries.handler";
import { COUNTRY_REPOSITORY } from "./domain/ports/country.repository.port";
import { PrismaCountryRepository } from "./infrastructure/prisma-country.repository";
import { CountriesController } from "./presentation/countries.controller";

/**
 * Orchestration module for the `country` table (the catalogue behind
 * `GET /countries`). Global, read-only reference data: authed but NOT
 * user-scoped — the same documented exception to Constitution Principle II the
 * old `reference` module carried, and the reason this domain has no aggregate
 * (nothing to protect: no writes reach it from the API, rows are seeded).
 *
 * `country.data.module.ts` (the name-lookup leaf used by `user`) stays separate
 * so consumers don't inherit this controller.
 */
@Module({
  imports: [CqrsModule, JwtModule.register({}), CountryIdentifierTypeDataModule],
  controllers: [CountriesController],
  providers: [
    ListCountriesQueryHandler,
    { provide: COUNTRY_REPOSITORY, useClass: PrismaCountryRepository },
    JwtAuthGuard,
  ],
})
export class CountryModule {}
