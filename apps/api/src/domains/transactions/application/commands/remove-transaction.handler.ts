import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { subtractMoney } from "@finance/money";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { TransactionNotFoundError } from "../../domain/errors";
import { MovementPolicy } from "../../domain/movement-policy";
import type { Transaction } from "../../domain/transaction.aggregate";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
} from "../../domain/ports/transaction.repository.port";
import { RemoveTransactionCommand } from "./remove-transaction.command";

interface Context {
  current: Transaction;
  creditUsedDelta: { accountId: string; delta: string } | null;
}

/**
 * Deletes a movement, reverting its contribution to the credit pool it drew
 * on (if any) — unless its billing period is already PAID (settled, never
 * touched again). Ported unchanged from `TransactionsService.remove`.
 */
@Injectable()
@CommandHandler(RemoveTransactionCommand)
export class RemoveTransactionHandler extends BaseCommandHandler<RemoveTransactionCommand, void, Context> {
  constructor(
    eventBus: EventBus,
    @Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: RemoveTransactionCommand): Promise<Context> {
    const current = await this.repo.findOne(command.userId, command.id);
    if (!current) throw new TransactionNotFoundError();

    const linkedToPaid = current.creditStatementId ? await this.repo.isStatementPaid(current.creditStatementId) : false;

    let creditUsedDelta: { accountId: string; delta: string } | null = null;
    if (!linkedToPaid && current.bankAccountId) {
      const account = await this.repo.findAccount(command.userId, current.bankAccountId);
      const card = current.cardId
        ? await this.repo.findCardInAccount(command.userId, current.cardId, current.bankAccountId)
        : null;
      const cardLimit =
        card?.kind === "CREDIT" ? await this.repo.findCardLimit(command.userId, current.cardId!, current.currency) : null;
      const contribution = account
        ? MovementPolicy.contribution({ type: current.type, amount: current.amount }, account, card, cardLimit)
        : "0";
      if (contribution !== "0") {
        creditUsedDelta = { accountId: current.bankAccountId, delta: subtractMoney("0", contribution) };
      }
    }

    return { current, creditUsedDelta };
  }

  protected async handle(command: RemoveTransactionCommand, context: Context): Promise<HandleResult<void>> {
    const ok = await this.repo.removeWithCreditAdjustment(command.userId, command.id, context.creditUsedDelta);
    if (!ok) throw new TransactionNotFoundError();
    return { result: undefined, events: [] };
  }
}
