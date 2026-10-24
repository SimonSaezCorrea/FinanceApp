import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QueryHandler } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";

import { getCursorSigningSecret } from "../../../../infra/config/cursor.config";
import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  CREDIT_STATEMENT_LOOKUP,
  type CreditStatementLookupPort,
} from "../../../credit-statement/domain/ports/credit-statement-lookup.port";
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
import { ListTransactionsQuery } from "./list-transactions.query";
import { decodeCursor, encodeCursor } from "./transaction-cursor";
import { resolveListFilter } from "./transaction-list-filter";

@Injectable()
@QueryHandler(ListTransactionsQuery)
export class ListTransactionsQueryHandler extends BaseQueryHandler<
  ListTransactionsQuery,
  transactions.TransactionPage,
  TransactionListFilter
> {
  private readonly cursorSecret: string;

  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort,
    @Inject(CREDIT_STATEMENT_LOOKUP) private readonly statements: CreditStatementLookupPort,
    @Inject(CUSTOM_FIELD_REPOSITORY) private readonly fields: CustomFieldRepositoryPort,
    @Inject(TRANSACTION_FIELD_VALUE_REPOSITORY)
    private readonly fieldValues: TransactionFieldValueRepositoryPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
    config: ConfigService,
  ) {
    super();
    this.cursorSecret = getCursorSigningSecret(config);
  }

  protected async loadContext(query: ListTransactionsQuery): Promise<TransactionListFilter> {
    const deps = { fields: this.fields, values: this.fieldValues, cards: this.cards };
    return resolveListFilter(deps, query.userId, query.filters);
  }

  protected async handle(
    query: ListTransactionsQuery,
    where: TransactionListFilter,
  ): Promise<transactions.TransactionPage> {
    const { limit, cursor } = query.filters;
    const page = await this.repo.list(query.userId, where, {
      limit,
      cursor: cursor ? decodeCursor(cursor, this.cursorSecret) : undefined,
    });
    const items = page.items.map((r) => r.toContract());
    // One batched lookup per page (never per row) — almost always an empty
    // result, since only a statement's own payment movement ever matches.
    const paymentInfo = await this.statements.paymentInfoFor(items.map((i) => i.id));
    const transferInfo = await this.statements.transferInfoFor(items.map((i) => i.id));
    const values = await this.fieldValues.listForTransactions(
      query.userId,
      items.map((i) => i.id),
    );
    return {
      items: items.map((raw) => {
        const i = { ...raw, customFields: values.get(raw.id) ?? {} };
        const info = paymentInfo.get(i.id);
        const withPayment = info
          ? { ...i, paidStatementId: info.statementId, paidStatementAccountId: info.accountId }
          : i;
        const transferred = transferInfo.get(i.id);
        return transferred ? { ...withPayment, transferStatementId: transferred } : withPayment;
      }),
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor, this.cursorSecret) : null,
    };
  }
}
