import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  TRANSACTION_REPOSITORY,
  type TransactionListFilter,
  type TransactionRepositoryPort,
} from "../../domain/ports/transaction.repository.port";
import { ListTransactionsQuery } from "./list-transactions.query";

@Injectable()
@QueryHandler(ListTransactionsQuery)
export class ListTransactionsQueryHandler extends BaseQueryHandler<
  ListTransactionsQuery,
  transactions.Transaction[],
  TransactionListFilter
> {
  constructor(@Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort) {
    super();
  }

  protected async loadContext(query: ListTransactionsQuery): Promise<TransactionListFilter> {
    const { filters } = query;
    return {
      type: filters.type,
      bankAccountId: filters.bankAccountId,
      cardId: filters.cardId,
      occurredFrom: filters.from ? new Date(filters.from) : undefined,
      occurredTo: filters.to ? new Date(filters.to) : undefined,
    };
  }

  protected async handle(
    query: ListTransactionsQuery,
    where: TransactionListFilter,
  ): Promise<transactions.Transaction[]> {
    const rows = await this.repo.list(query.userId, where);
    return rows.map((r) => r.toContract());
  }
}
