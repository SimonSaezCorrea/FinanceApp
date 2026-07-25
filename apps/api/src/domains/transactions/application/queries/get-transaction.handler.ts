import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { TransactionNotFoundError } from "../../domain/errors";
import type { Transaction } from "../../domain/transaction.aggregate";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
} from "../../domain/ports/transaction.repository.port";
import { GetTransactionQuery } from "./get-transaction.query";

@Injectable()
@QueryHandler(GetTransactionQuery)
export class GetTransactionQueryHandler extends BaseQueryHandler<GetTransactionQuery, transactions.Transaction, Transaction> {
  constructor(@Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort) {
    super();
  }

  protected async loadContext(query: GetTransactionQuery): Promise<Transaction> {
    const row = await this.repo.findOne(query.userId, query.id);
    if (!row) throw new TransactionNotFoundError();
    return row;
  }

  protected async handle(_query: GetTransactionQuery, row: Transaction): Promise<transactions.Transaction> {
    return row.toContract();
  }
}
