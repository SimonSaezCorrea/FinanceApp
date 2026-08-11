import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  TRANSACTION_REPOSITORY,
  type TransactionListFilter,
  type TransactionRepositoryPort,
} from "../../domain/ports/transaction.repository.port";
import { SummarizeTransactionsQuery } from "./summarize-transactions.query";
import { toListFilter } from "./transaction-list-filter";

@Injectable()
@QueryHandler(SummarizeTransactionsQuery)
export class SummarizeTransactionsQueryHandler extends BaseQueryHandler<
  SummarizeTransactionsQuery,
  transactions.TransactionSummary,
  TransactionListFilter
> {
  constructor(@Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort) {
    super();
  }

  protected async loadContext(query: SummarizeTransactionsQuery): Promise<TransactionListFilter> {
    return toListFilter(query.filters);
  }

  protected async handle(
    query: SummarizeTransactionsQuery,
    where: TransactionListFilter,
  ): Promise<transactions.TransactionSummary> {
    return this.repo.summary(query.userId, where);
  }
}
