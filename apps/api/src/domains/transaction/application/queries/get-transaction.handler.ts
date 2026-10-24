import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  CREDIT_STATEMENT_LOOKUP,
  type CreditStatementLookupPort,
} from "../../../credit-statement/domain/ports/credit-statement-lookup.port";
import {
  TRANSACTION_FIELD_VALUE_REPOSITORY,
  type TransactionFieldValueRepositoryPort,
} from "../../../transaction-field-value/domain/ports/transaction-field-value.repository.port";
import { TransactionNotFoundError } from "../../domain/errors";
import type { Transaction } from "../../domain/transaction.aggregate";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
} from "../../domain/ports/transaction.repository.port";
import { GetTransactionQuery } from "./get-transaction.query";

@Injectable()
@QueryHandler(GetTransactionQuery)
export class GetTransactionQueryHandler extends BaseQueryHandler<
  GetTransactionQuery,
  transactions.Transaction,
  Transaction
> {
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort,
    @Inject(CREDIT_STATEMENT_LOOKUP) private readonly statements: CreditStatementLookupPort,
    @Inject(TRANSACTION_FIELD_VALUE_REPOSITORY)
    private readonly fieldValues: TransactionFieldValueRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(query: GetTransactionQuery): Promise<Transaction> {
    const row = await this.repo.findOne(query.userId, query.id);
    if (!row) throw new TransactionNotFoundError();
    return row;
  }

  protected async handle(
    query: GetTransactionQuery,
    row: Transaction,
  ): Promise<transactions.Transaction> {
    const values = await this.fieldValues.listForTransactions(query.userId, [row.id]);
    const dto = { ...row.toContract(), customFields: values.get(row.id) ?? {} };
    const info = (await this.statements.paymentInfoFor([dto.id])).get(dto.id);
    const transferred = (await this.statements.transferInfoFor([dto.id])).get(dto.id);
    const withPayment = info
      ? { ...dto, paidStatementId: info.statementId, paidStatementAccountId: info.accountId }
      : dto;
    return transferred ? { ...withPayment, transferStatementId: transferred } : withPayment;
  }
}
