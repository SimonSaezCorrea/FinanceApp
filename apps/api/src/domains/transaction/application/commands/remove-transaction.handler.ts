import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { subtractMoney } from "@finance/money";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { reverseBalanceDelta, reverseCashDelta } from "../../domain/balance-delta";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import {
  CARD_LIMIT_REPOSITORY,
  type CardLimitRepositoryPort,
} from "../../../card-limit/domain/ports/card-limit.repository.port";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../../credit-statement/domain/ports/credit-statement.repository.port";
import { TransactionNotFoundError } from "../../domain/errors";
import { MovementPolicy } from "../../domain/movement-policy";
import type { Transaction } from "../../domain/transaction.aggregate";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
} from "../../domain/ports/transaction.repository.port";
import { loadAccountContext } from "../account-context.loader";
import { netDeltas } from "./update-transfer.handler";
import { RemoveTransactionCommand } from "./remove-transaction.command";

interface Context {
  current: Transaction;
  creditUsedDelta: { accountId: string; delta: string } | null;
  /** What deleting this movement gives back to the account's cash balance
   * ("0" for one charged to a credit line, which never took cash out). */
  cashReversal: string;
}

/**
 * Deletes a movement, reverting its contribution to the credit pool it drew
 * on (if any) — unless its billing period is already PAID (settled, never
 * touched again). Ported unchanged from `TransactionsService.remove`.
 */
@Injectable()
@CommandHandler(RemoveTransactionCommand)
export class RemoveTransactionHandler extends BaseCommandHandler<
  RemoveTransactionCommand,
  void,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
    @Inject(CARD_LIMIT_REPOSITORY) private readonly cardLimits: CardLimitRepositoryPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY) private readonly statements: CreditStatementRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: RemoveTransactionCommand): Promise<Context> {
    const current = await this.repo.findOne(command.userId, command.id);
    if (!current) throw new TransactionNotFoundError();

    // A transfer leg is deleted as a PAIR (FR-015): the user deletes from the row
    // they're looking at and has no reason to know there are two.
    if (current.isTransferLeg) {
      return {
        current,
        creditUsedDelta: null,
        // A transfer never involves a card and is settled below as a pair.
        cashReversal: reverseBalanceDelta(current.type, current.amount),
      };
    }

    const linkedToPaid = current.creditStatementId
      ? await this.statements.isPaid(current.creditStatementId)
      : false;

    let creditUsedDelta: { accountId: string; delta: string } | null = null;
    // A movement linked to a statement was charged to a credit line, whatever
    // its state: it never took cash out, so deleting it gives none back.
    let cashReversal = current.creditStatementId ? "0" : null;
    if (!linkedToPaid && current.bankAccountId) {
      const loaded = await loadAccountContext(this.accounts, command.userId, current.bankAccountId);
      const account = loaded?.context ?? null;
      const card = current.cardId
        ? await this.cards.findOnAccount(command.userId, current.bankAccountId, current.cardId)
        : null;
      const cardLimit =
        card?.kind === "CREDIT"
          ? await this.cardLimits.findForCardCurrency(
              command.userId,
              current.cardId!,
              current.currency,
            )
          : null;
      const contribution = account
        ? MovementPolicy.contribution(
            { type: current.type, amount: current.amount },
            account,
            card,
            cardLimit,
          )
        : "0";
      if (contribution !== "0") {
        creditUsedDelta = {
          accountId: current.bankAccountId,
          delta: subtractMoney("0", contribution),
        };
      }
      cashReversal ??= reverseCashDelta(current.type, current.amount, account, card);
    }

    return {
      current,
      creditUsedDelta,
      cashReversal: cashReversal ?? reverseBalanceDelta(current.type, current.amount),
    };
  }

  protected async handle(
    command: RemoveTransactionCommand,
    context: Context,
  ): Promise<HandleResult<void>> {
    const { current } = context;
    if (current.isTransferLeg) {
      const pair = await this.repo.findTransferGroup(command.userId, current.transferGroupId!);
      if (!pair) throw new TransactionNotFoundError();
      const removed = await this.repo.removeTransferPair(
        command.userId,
        current.transferGroupId!,
        netDeltas([
          {
            accountId: pair.outgoing.bankAccountId!,
            delta: reverseBalanceDelta("EXPENSE", pair.outgoing.amount),
          },
          {
            accountId: pair.incoming.bankAccountId!,
            delta: reverseBalanceDelta("INCOME", pair.incoming.amount),
          },
        ]),
      );
      if (!removed) throw new TransactionNotFoundError();
      return { result: undefined, events: [] };
    }

    const ok = await this.repo.removeWithCreditAdjustment(
      command.userId,
      command.id,
      context.creditUsedDelta,
      // Undo what this movement did to the balance — nothing, when it was
      // charged to a credit line (the cash never left; see `cashDelta`).
      context.current.bankAccountId && context.cashReversal !== "0"
        ? [{ accountId: context.current.bankAccountId, delta: context.cashReversal }]
        : [],
    );
    if (!ok) throw new TransactionNotFoundError();
    return { result: undefined, events: [] };
  }
}
