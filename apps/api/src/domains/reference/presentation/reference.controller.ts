import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { reference } from "@finance/contracts";

import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { ListCountriesQuery } from "../application/queries/list-countries.query";
import { ListCurrenciesQuery } from "../application/queries/list-currencies.query";
import { ListInstitutionsQuery } from "../application/queries/list-institutions.query";

/**
 * Facade (FR-012): translates each HTTP request into a query and dispatches
 * it via `QueryBus` — never touches a repository directly. Global read-only
 * reference data. Requires auth but is not user-scoped.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class ReferenceController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get("countries")
  countries(): Promise<reference.Country[]> {
    return this.queryBus.execute(new ListCountriesQuery());
  }

  @Get("institutions")
  institutions(
    @Query(new ZodValidationPipe(reference.institutionFiltersSchema))
    query: reference.InstitutionFilters,
  ): Promise<reference.Institution[]> {
    return this.queryBus.execute(new ListInstitutionsQuery(query));
  }

  @Get("currencies")
  currencies(): Promise<reference.Currency[]> {
    return this.queryBus.execute(new ListCurrenciesQuery());
  }
}
