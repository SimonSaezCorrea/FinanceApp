import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { reference } from "@finance/contracts";

import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { ListInstitutionsQuery } from "../application/queries/list-institutions.query";

/** Facade (FR-012) for `GET /institutions?country=&kind=` — banks and non-bank
 * card issuers. Global reference data: authed, not user-scoped. */
@Controller()
@UseGuards(JwtAuthGuard)
export class InstitutionsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get("institutions")
  institutions(
    @Query(new ZodValidationPipe(reference.institutionFiltersSchema))
    query: reference.InstitutionFilters,
  ): Promise<reference.Institution[]> {
    return this.queryBus.execute(new ListInstitutionsQuery(query));
  }
}
