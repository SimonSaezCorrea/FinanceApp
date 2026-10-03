import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  CATEGORY_LOOKUP,
  type CategoryLookupPort,
} from "../../../category/domain/ports/category-lookup.port";
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
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort,
    @Inject(CATEGORY_LOOKUP) private readonly categories: CategoryLookupPort,
  ) {
    super();
  }

  protected async loadContext(query: SummarizeTransactionsQuery): Promise<TransactionListFilter> {
    return toListFilter(query.filters);
  }

  protected async handle(
    query: SummarizeTransactionsQuery,
    where: TransactionListFilter,
  ): Promise<transactions.TransactionSummary> {
    const internal = await Promise.all([
      this.categories.idForSystemCode("STATEMENT_PAYMENT"),
      this.categories.idForSystemCode("CARD_PREPAYMENT"),
    ]);
    return this.repo.summary(query.userId, where, internal);
  }
}
