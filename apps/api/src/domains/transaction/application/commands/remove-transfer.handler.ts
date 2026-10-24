import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  TRANSACTION_FIELD_VALUE_REPOSITORY,
  type TransactionFieldValueRepositoryPort,
} from "../../../transaction-field-value/domain/ports/transaction-field-value.repository.port";
import { reverseTransferLegDelta } from "../../domain/balance-delta";
import { TransferNotFoundError } from "../../domain/errors";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
  type TransferPair,
} from "../../domain/ports/transaction.repository.port";
import { loadTransferAccounts } from "./create-transfer.handler";
import { netDeltas } from "./update-transfer.handler";
import { RemoveTransferCommand } from "./remove-transfer.command";

/** Deletes both legs of a transfer and gives both accounts their money back. A
 * transfer made by "Transferir pendientes" also gives the movements it covered their
 * previous custom field value back, in the same transaction (specs/036, FR-025). */
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
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(TRANSACTION_FIELD_VALUE_REPOSITORY)
    private readonly fieldValues: TransactionFieldValueRepositoryPort,
    private readonly prisma: PrismaService,
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
    // A leg on a credit card account (paying the card) gives back pool, not cash.
    const legs = await loadTransferAccounts(
      this.accounts,
      command.userId,
      pair.outgoing.bankAccountId ?? undefined,
      pair.incoming.bankAccountId ?? undefined,
    );
    const deltas = netDeltas([
      ...(legs.from ? [reverseTransferLegDelta("EXPENSE", pair.outgoing.amount, legs.from)] : []),
      ...(legs.to ? [reverseTransferLegDelta("INCOME", pair.incoming.amount, legs.to)] : []),
    ]);

    const removed = await this.prisma.$transaction(async (tx) => {
      const ok = await this.repo.removeTransferPairWithTx(
        tx,
        command.userId,
        command.transferGroupId,
        deltas,
      );
      if (ok)
        await this.fieldValues.revertCoverWithTx(tx, command.userId, [command.transferGroupId]);
      return ok;
    });
    if (!removed) throw new TransferNotFoundError();
    return { result: undefined, events: [] };
  }
}
