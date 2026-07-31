import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { investments } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { InvestmentNotFoundError } from "../../domain/errors";
import type { Investment } from "../../domain/investment.aggregate";
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepositoryPort,
} from "../../domain/ports/investment.repository.port";
import { GetInvestmentQuery } from "./get-investment.query";

@Injectable()
@QueryHandler(GetInvestmentQuery)
export class GetInvestmentQueryHandler extends BaseQueryHandler<
  GetInvestmentQuery,
  investments.Investment,
  Investment
> {
  constructor(@Inject(INVESTMENT_REPOSITORY) private readonly repo: InvestmentRepositoryPort) {
    super();
  }

  protected async loadContext(query: GetInvestmentQuery): Promise<Investment> {
    const row = await this.repo.findOne(query.userId, query.id);
    if (!row) throw new InvestmentNotFoundError();
    return row;
  }

  protected async handle(
    _query: GetInvestmentQuery,
    row: Investment,
  ): Promise<investments.Investment> {
    return row.toContract();
  }
}
