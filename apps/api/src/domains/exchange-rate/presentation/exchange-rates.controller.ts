import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { exchangeRates } from "@finance/contracts";

import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { ListExchangeRatesQuery } from "../application/queries/list-exchange-rates.query";
import { chileDay } from "../domain/exchange-rate.entity";

/** Facade for `GET /exchange-rates` — global reference data: authed, but deliberately not
 * user-scoped. READ ONLY: rows are written by the system's daily recorder, never over HTTP. */
@Controller()
@UseGuards(JwtAuthGuard)
export class ExchangeRatesController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get("exchange-rates")
  list(
    @Query(new ZodValidationPipe(exchangeRates.listExchangeRatesQuerySchema))
    filters: exchangeRates.ListExchangeRatesQuery,
  ): Promise<exchangeRates.ListExchangeRatesResponse> {
    return this.queryBus.execute(new ListExchangeRatesQuery(filters, chileDay(new Date())));
  }
}
