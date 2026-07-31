import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { reference } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  COUNTRY_REPOSITORY,
  type CountryRepositoryPort,
} from "../../domain/ports/country.repository.port";
import { ListCountriesQuery } from "./list-countries.query";

@Injectable()
@QueryHandler(ListCountriesQuery)
export class ListCountriesQueryHandler extends BaseQueryHandler<
  ListCountriesQuery,
  reference.Country[]
> {
  constructor(@Inject(COUNTRY_REPOSITORY) private readonly repo: CountryRepositoryPort) {
    super();
  }

  protected async loadContext(): Promise<void> {
    // Global read, nothing to load ahead of the query itself.
  }

  protected async handle(): Promise<reference.Country[]> {
    return this.repo.findAll();
  }
}
