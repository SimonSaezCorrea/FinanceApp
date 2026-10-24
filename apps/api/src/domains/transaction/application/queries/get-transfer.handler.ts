import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  TRANSACTION_FIELD_VALUE_REPOSITORY,
  type TransactionFieldValueRepositoryPort,
} from "../../../transaction-field-value/domain/ports/transaction-field-value.repository.port";
import { TransferNotFoundError } from "../../domain/errors";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
  type TransferPair,
} from "../../domain/ports/transaction.repository.port";
import { toTransferContract } from "../commands/create-transfer.handler";
import { GetTransferQuery } from "./get-transfer.query";

/** Both legs of a transfer — what the form needs to edit it from either side — with
 * their custom field values and, for one made by "Transferir pendientes", how many
 * movements it covers (what deleting it would give back, specs/036). */
@Injectable()
@QueryHandler(GetTransferQuery)
export class GetTransferQueryHandler extends BaseQueryHandler<
  GetTransferQuery,
  transactions.Transfer,
  TransferPair
> {
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort,
    @Inject(TRANSACTION_FIELD_VALUE_REPOSITORY)
    private readonly fieldValues: TransactionFieldValueRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(query: GetTransferQuery): Promise<TransferPair> {
    const pair = await this.repo.findTransferGroup(query.userId, query.transferGroupId);
    if (!pair) throw new TransferNotFoundError();
    return pair;
  }

  protected async handle(
    query: GetTransferQuery,
    pair: TransferPair,
  ): Promise<transactions.Transfer> {
    const base = toTransferContract(pair);
    const [values, coveredCount] = await Promise.all([
      this.fieldValues.listForTransactions(query.userId, [pair.outgoing.id, pair.incoming.id]),
      this.fieldValues.coveredCount(query.userId, pair.transferGroupId),
    ]);
    return {
      ...base,
      outgoing: { ...base.outgoing, customFields: values.get(pair.outgoing.id) ?? {} },
      incoming: { ...base.incoming, customFields: values.get(pair.incoming.id) ?? {} },
      coveredCount,
    };
  }
}
