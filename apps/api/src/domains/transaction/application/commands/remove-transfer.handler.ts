import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { reverseBalanceDelta } from "../../domain/balance-delta";
import { TransferNotFoundError } from "../../domain/errors";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
  type TransferPair,
} from "../../domain/ports/transaction.repository.port";
import { netDeltas } from "./update-transfer.handler";
import { RemoveTransferCommand } from "./remove-transfer.command";

/** Deletes both legs of a transfer and gives both accounts their money back. */
@Injectable()
@CommandHandler(RemoveTransferCommand)
export class RemoveTransferHandler extends BaseCommandHandler<
  RemoveTransferCommand,
  void,
  TransferPair
> {
  constructor(
    eventBus: EventBus,
    @Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: RemoveTransferCommand): Promise<TransferPair> {
    const pair = await this.repo.findTransferGroup(command.userId, command.transferGroupId);
    if (!pair) throw new TransferNotFoundError();
    return pair;
  }

  protected async handle(
    command: RemoveTransferCommand,
    pair: TransferPair,
  ): Promise<HandleResult<void>> {
    const deltas = netDeltas([
      {
        accountId: pair.outgoing.bankAccountId!,
        delta: reverseBalanceDelta("EXPENSE", pair.outgoing.amount),
      },
      {
        accountId: pair.incoming.bankAccountId!,
        delta: reverseBalanceDelta("INCOME", pair.incoming.amount),
      },
    ]);

    const removed = await this.repo.removeTransferPair(
      command.userId,
      command.transferGroupId,
      deltas,
    );
    if (!removed) throw new TransferNotFoundError();
    return { result: undefined, events: [] };
  }
}
