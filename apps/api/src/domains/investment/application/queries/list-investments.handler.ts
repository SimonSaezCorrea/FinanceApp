import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { investments } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepositoryPort,
} from "../../domain/ports/investment.repository.port";
import { ListInvestmentsQuery } from "./list-investments.query";

@Injectable()
@QueryHandler(ListInvestmentsQuery)
export class ListInvestmentsQueryHandler extends BaseQueryHandler<
  ListInvestmentsQuery,
  investments.Investment[],
  string
> {
  constructor(@Inject(INVESTMENT_REPOSITORY) private readonly repo: InvestmentRepositoryPort) {
    super();
  }

  protected async loadContext(query: ListInvestmentsQuery): Promise<string> {
    return query.userId;
  }

  protected async handle(
    _query: ListInvestmentsQuery,
    userId: string,
  ): Promise<investments.Investment[]> {
    const rows = await this.repo.list(userId);
    return rows.map((r) => r.toContract());
  }
}
