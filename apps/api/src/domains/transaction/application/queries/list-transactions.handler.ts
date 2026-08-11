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
import { decodeCursor, encodeCursor } from "./transaction-cursor";
import { toListFilter } from "./transaction-list-filter";

@Injectable()
@QueryHandler(ListTransactionsQuery)
export class ListTransactionsQueryHandler extends BaseQueryHandler<
  ListTransactionsQuery,
  transactions.TransactionPage,
  TransactionListFilter
> {
  constructor(@Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort) {
    super();
  }

  protected async loadContext(query: ListTransactionsQuery): Promise<TransactionListFilter> {
    return toListFilter(query.filters);
  }

  protected async handle(
    query: ListTransactionsQuery,
    where: TransactionListFilter,
  ): Promise<transactions.TransactionPage> {
    const { limit, cursor } = query.filters;
    const page = await this.repo.list(query.userId, where, {
      limit,
      cursor: cursor ? decodeCursor(cursor) : undefined,
    });
    return {
      items: page.items.map((r) => r.toContract()),
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    };
  }
}
