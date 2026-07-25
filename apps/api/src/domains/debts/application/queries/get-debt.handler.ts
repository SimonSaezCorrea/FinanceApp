import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { debts } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { DebtNotFoundError } from "../../domain/errors";
import type { Debt } from "../../domain/debt.aggregate";
import { DEBT_REPOSITORY, type DebtRepositoryPort } from "../../domain/ports/debt.repository.port";
import { GetDebtQuery } from "./get-debt.query";

@Injectable()
@QueryHandler(GetDebtQuery)
export class GetDebtQueryHandler extends BaseQueryHandler<GetDebtQuery, debts.Debt, Debt> {
  constructor(@Inject(DEBT_REPOSITORY) private readonly repo: DebtRepositoryPort) {
    super();
  }

  protected async loadContext(query: GetDebtQuery): Promise<Debt> {
    const row = await this.repo.findOne(query.userId, query.id);
    if (!row) throw new DebtNotFoundError();
    return row;
  }

  protected async handle(_query: GetDebtQuery, row: Debt): Promise<debts.Debt> {
    return row.toContract();
  }
}
