import { Controller, Get, UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { reference } from "@finance/contracts";

import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ListCurrenciesQuery } from "../application/queries/list-currencies.query";

/** Facade (FR-012) for `GET /currencies` — the ISO 4217 catalogue. Global
 * reference data: authed, not user-scoped. */
@Controller()
@UseGuards(JwtAuthGuard)
export class CurrenciesController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get("currencies")
  currencies(): Promise<reference.Currency[]> {
    return this.queryBus.execute(new ListCurrenciesQuery());
  }
}
