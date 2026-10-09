import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import { exchangeRates } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { ExchangeRangeTooLargeError, InvalidDateRangeError } from "../../domain/errors";
import type { ExchangeRateEntry } from "../../domain/exchange-rate.entity";
import {
  EXCHANGE_RATE_REPOSITORY,
  type ExchangeRateRepositoryPort,
} from "../../domain/ports/exchange-rate.repository.port";
import { ListExchangeRatesQuery } from "./list-exchange-rates.query";

type Result = exchangeRates.ListExchangeRatesResponse;

const toDto = (e: ExchangeRateEntry): exchangeRates.ExchangeRate => ({
  currency: e.currency,
  date: e.date,
  value: e.value,
  valueDate: e.valueDate,
});

/** `GET /exchange-rates`: the daily values of a bounded window, newest first, plus the most
 * recent row of each currency (what "el valor vigente" reads, whatever the window). */
@Injectable()
@QueryHandler(ListExchangeRatesQuery)
export class ListExchangeRatesQueryHandler extends BaseQueryHandler<
  ListExchangeRatesQuery,
  Result,
  null
> {
  constructor(@Inject(EXCHANGE_RATE_REPOSITORY) private readonly repo: ExchangeRateRepositoryPort) {
    super();
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(query: ListExchangeRatesQuery): Promise<Result> {
    const { from, to } = exchangeRates.resolveExchangeRange(query.filters, query.today);
    if (from > to) throw new InvalidDateRangeError();
    if (exchangeRates.exchangeRangeDays(from, to) > exchangeRates.EXCHANGE_RANGE_MAX_DAYS) {
      throw new ExchangeRangeTooLargeError();
    }

    const [items, usd, clf] = await Promise.all([
      this.repo.findRange(query.filters.currency, from, to),
      this.repo.findLatest("USD"),
      this.repo.findLatest("CLF"),
    ]);
    return {
      items: items.map(toDto),
      latest: { USD: usd ? toDto(usd) : null, CLF: clf ? toDto(clf) : null },
    };
  }
}
