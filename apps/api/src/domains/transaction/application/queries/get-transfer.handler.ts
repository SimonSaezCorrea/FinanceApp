import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { TransferNotFoundError } from "../../domain/errors";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
  type TransferPair,
} from "../../domain/ports/transaction.repository.port";
import { toTransferContract } from "../commands/create-transfer.handler";
import { GetTransferQuery } from "./get-transfer.query";

/** Both legs of a transfer — what the form needs to edit it from either side. */
@Injectable()
@QueryHandler(GetTransferQuery)
export class GetTransferQueryHandler extends BaseQueryHandler<
  GetTransferQuery,
  transactions.Transfer,
  TransferPair
> {
  constructor(@Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort) {
    super();
  }

  protected async loadContext(query: GetTransferQuery): Promise<TransferPair> {
    const pair = await this.repo.findTransferGroup(query.userId, query.transferGroupId);
    if (!pair) throw new TransferNotFoundError();
    return pair;
  }

  protected async handle(
    _query: GetTransferQuery,
    pair: TransferPair,
  ): Promise<transactions.Transfer> {
    return toTransferContract(pair);
  }
}
