import { Controller, Get, UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { reference } from "@finance/contracts";

import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ListCountriesQuery } from "../application/queries/list-countries.query";

/** Facade (FR-012) for `GET /countries` — global reference data: authed, but
 * deliberately not user-scoped. */
@Controller()
@UseGuards(JwtAuthGuard)
export class CountriesController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get("countries")
  countries(): Promise<reference.Country[]> {
    return this.queryBus.execute(new ListCountriesQuery());
  }
}
