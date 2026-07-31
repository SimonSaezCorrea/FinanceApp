import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { reference } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  CURRENCY_REPOSITORY,
  type CurrencyRepositoryPort,
} from "../../domain/ports/currency.repository.port";
import { ListCurrenciesQuery } from "./list-currencies.query";

@Injectable()
@QueryHandler(ListCurrenciesQuery)
export class ListCurrenciesQueryHandler extends BaseQueryHandler<
  ListCurrenciesQuery,
  reference.Currency[]
> {
  constructor(@Inject(CURRENCY_REPOSITORY) private readonly repo: CurrencyRepositoryPort) {
    super();
  }

  protected async loadContext(): Promise<void> {
    // Global read, nothing to load ahead of the query itself.
  }

  protected async handle(): Promise<reference.Currency[]> {
    return this.repo.findAll();
  }
}
