import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { debts } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { DEBT_REPOSITORY, type DebtRepositoryPort } from "../../domain/ports/debt.repository.port";
import { ListDebtsQuery } from "./list-debts.query";

@Injectable()
@QueryHandler(ListDebtsQuery)
export class ListDebtsQueryHandler extends BaseQueryHandler<ListDebtsQuery, debts.Debt[], string> {
  constructor(@Inject(DEBT_REPOSITORY) private readonly repo: DebtRepositoryPort) {
    super();
  }

  protected async loadContext(query: ListDebtsQuery): Promise<string> {
    return query.userId;
  }

  protected async handle(_query: ListDebtsQuery, userId: string): Promise<debts.Debt[]> {
    const rows = await this.repo.list(userId);
    return rows.map((r) => r.toContract());
  }
}
