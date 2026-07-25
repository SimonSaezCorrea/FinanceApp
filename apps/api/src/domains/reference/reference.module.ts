import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { ListCountriesQueryHandler } from "./application/queries/list-countries.handler";
import { ListCurrenciesQueryHandler } from "./application/queries/list-currencies.handler";
import { ListInstitutionsQueryHandler } from "./application/queries/list-institutions.handler";
import { COUNTRY_REPOSITORY } from "./domain/ports/country.repository.port";
import { CURRENCY_REPOSITORY } from "./domain/ports/currency.repository.port";
import { INSTITUTION_REPOSITORY } from "./domain/ports/institution.repository.port";
import { PrismaCountryRepository } from "./infrastructure/prisma-country.repository";
import { PrismaCurrencyRepository } from "./infrastructure/prisma-currency.repository";
import { PrismaInstitutionRepository } from "./infrastructure/prisma-institution.repository";
import { ReferenceController } from "./presentation/reference.controller";

const queryHandlers = [
  ListCountriesQueryHandler,
  ListInstitutionsQueryHandler,
  ListCurrenciesQueryHandler,
];

/**
 * Global, read-only reference data (countries, banks/issuers, currencies) —
 * authed but deliberately NOT user-scoped (per spec.md's Clarifications and
 * `plan.md` Phase 8: shared/global data, not personal banking data, so
 * Constitution Principle II's per-user isolation doesn't apply here — same
 * documented exception as the billing cron's `scope: "system"` commands).
 * Queries only: this domain has no writes to protect, so no commands/
 * aggregates exist here (FR-017's uniform structure still applies — every
 * layer is present, just genuinely minimal in the domain layer).
 */
@Module({
  imports: [CqrsModule, JwtModule.register({})],
  controllers: [ReferenceController],
  providers: [
    ...queryHandlers,
    { provide: COUNTRY_REPOSITORY, useClass: PrismaCountryRepository },
    { provide: INSTITUTION_REPOSITORY, useClass: PrismaInstitutionRepository },
    { provide: CURRENCY_REPOSITORY, useClass: PrismaCurrencyRepository },
    JwtAuthGuard,
  ],
  exports: [],
})
export class ReferenceModule {}
