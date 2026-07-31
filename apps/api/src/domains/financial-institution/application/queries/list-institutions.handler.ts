import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { reference } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  INSTITUTION_REPOSITORY,
  type InstitutionRepositoryPort,
} from "../../domain/ports/institution.repository.port";
import { ListInstitutionsQuery } from "./list-institutions.query";

@Injectable()
@QueryHandler(ListInstitutionsQuery)
export class ListInstitutionsQueryHandler extends BaseQueryHandler<
  ListInstitutionsQuery,
  reference.Institution[]
> {
  constructor(@Inject(INSTITUTION_REPOSITORY) private readonly repo: InstitutionRepositoryPort) {
    super();
  }

  protected async loadContext(): Promise<void> {
    // Global read, nothing to load ahead of the query itself.
  }

  protected async handle(query: ListInstitutionsQuery): Promise<reference.Institution[]> {
    return this.repo.findAll(query.filters);
  }
}
