import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  CATEGORY_LOOKUP,
  type CategoryLookupPort,
} from "../../../category/domain/ports/category-lookup.port";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import {
  CUSTOM_FIELD_REPOSITORY,
  type CustomFieldRepositoryPort,
} from "../../../custom-field/domain/ports/custom-field.repository.port";
import {
  TRANSACTION_FIELD_VALUE_REPOSITORY,
  type TransactionFieldValueRepositoryPort,
} from "../../../transaction-field-value/domain/ports/transaction-field-value.repository.port";
import {
  TRANSACTION_REPOSITORY,
  type TransactionListFilter,
  type TransactionRepositoryPort,
} from "../../domain/ports/transaction.repository.port";
import { SummarizeTransactionsQuery } from "./summarize-transactions.query";
import { resolveListFilter } from "./transaction-list-filter";

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
    @Inject(CUSTOM_FIELD_REPOSITORY) private readonly fields: CustomFieldRepositoryPort,
    @Inject(TRANSACTION_FIELD_VALUE_REPOSITORY)
    private readonly fieldValues: TransactionFieldValueRepositoryPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(query: SummarizeTransactionsQuery): Promise<TransactionListFilter> {
    const deps = { fields: this.fields, values: this.fieldValues, cards: this.cards };
    return resolveListFilter(deps, query.userId, query.filters);
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
