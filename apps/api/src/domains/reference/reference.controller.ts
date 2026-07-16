import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { reference } from "@finance/contracts";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../infra/http/zod-validation.pipe";
import { ReferenceService } from "./reference.service";

/** Global read-only reference data. Requires auth but is not user-scoped. */
@Controller()
@UseGuards(JwtAuthGuard)
export class ReferenceController {
  constructor(private readonly service: ReferenceService) {}

  @Get("countries")
  countries(): Promise<reference.Country[]> {
    return this.service.listCountries();
  }

  @Get("institutions")
  institutions(
    @Query(new ZodValidationPipe(reference.institutionFiltersSchema))
    query: reference.InstitutionFilters,
  ): Promise<reference.Institution[]> {
    return this.service.listInstitutions(query);
  }

  @Get("currencies")
  currencies(): Promise<reference.Currency[]> {
    return this.service.listCurrencies();
  }
}
