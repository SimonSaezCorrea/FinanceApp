import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { reference } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  CATEGORY_REPOSITORY,
  type CategoryRepositoryPort,
} from "../../domain/ports/category.repository.port";
import { ListCategoriesQuery } from "./list-categories.query";

@Injectable()
@QueryHandler(ListCategoriesQuery)
export class ListCategoriesQueryHandler extends BaseQueryHandler<
  ListCategoriesQuery,
  reference.Category[]
> {
  constructor(@Inject(CATEGORY_REPOSITORY) private readonly repo: CategoryRepositoryPort) {
    super();
  }

  protected async loadContext(): Promise<void> {
    // Global read, nothing to load ahead of the query itself.
  }

  protected async handle(): Promise<reference.Category[]> {
    return this.repo.findAll();
  }
}
