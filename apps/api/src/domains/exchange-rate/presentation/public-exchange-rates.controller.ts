import { Controller, Get, Header, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { exchangeRates } from "@finance/contracts";

import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { ListExchangeRatesQuery } from "../application/queries/list-exchange-rates.query";
import { chileDay } from "../domain/exchange-rate.entity";

/**
 * Facade for `GET /public/exchange-rates` (spec 033): the public site's indicator pages read the
 * same rows as the app WITHOUT a session. Deliberately NO `JwtAuthGuard` — the named exception of
 * Principle II for public reads of global reference data: the `exchange-rate` table has no
 * `userId`, this route reads no cookie and writes nothing. Same query, handler and response as the
 * authed `GET /exchange-rates`, which keeps its guard.
 */
@Controller()
export class PublicExchangeRatesController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get("public/exchange-rates")
  @Header("Cache-Control", "public, max-age=300")
  list(
    @Query(new ZodValidationPipe(exchangeRates.listExchangeRatesQuerySchema))
    filters: exchangeRates.ListExchangeRatesQuery,
  ): Promise<exchangeRates.ListExchangeRatesResponse> {
    return this.queryBus.execute(new ListExchangeRatesQuery(filters, chileDay(new Date())));
  }
}
