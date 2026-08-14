import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";
import { subtractMoney } from "@finance/money";

import { currentCycleStart } from "../../../billing-settings/domain/billing-cycle";
import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { accountBalanceDelta, balanceDelta, reverseBalanceDelta } from "../../domain/balance-delta";
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
import {
  AccountNotFoundError,
  TransactionNotFoundError,
  TransferEditAsPairError,
} from "../../domain/errors";
import { MovementPolicy, type EffectiveMovement } from "../../domain/movement-policy";
import type { Transaction, TransactionPatch } from "../../domain/transaction.aggregate";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
} from "../../domain/ports/transaction.repository.port";
import { loadAccountContext } from "../account-context.loader";
import { UpdateTransactionCommand } from "./update-transaction.command";

interface Context {
  current: Transaction;
  patch: TransactionPatch;
  creditUsedDeltas: { accountId: string; delta: string }[];
  balanceDeltas: { accountId: string; delta: string }[];
  /** How each PREPAID card's own pot moves: the old charge goes back on the card it
   * was made with, the new one comes off the card it is now made with. */
  prepaidDeltas: { cardId: string; delta: string }[];
}

/**
 * Edits a movement: re-validates the *effective* (patched) movement, nets its
 * old vs. new contribution to the credit pool(s) involved (same account nets
 * to one delta, a cross-account move reverts the old one and applies the new
 * one independently), and re-links the billing period unless it's already
 * PAID (settled contributions are never touched again). Ported unchanged
 * from the pre-migration `TransactionsService.update`.
 */
@Injectable()
@CommandHandler(UpdateTransactionCommand)
export class UpdateTransactionHandler extends BaseCommandHandler<
  UpdateTransactionCommand,
  transactions.Transaction,
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

  protected async loadContext(command: UpdateTransactionCommand): Promise<Context> {
    const { input, userId, id } = command;
    const current = await this.repo.findOne(userId, id);
    if (!current) throw new TransactionNotFoundError();
    // Editing one leg alone would desynchronise the pair (and the two balances
    // behind it): a transfer is edited through its own endpoint.
    if (current.isTransferLeg) throw new TransferEditAsPairError();

    const effectiveType = input.type ?? current.type;
    const effective: EffectiveMovement = {
      type: effectiveType,
      bankAccountId: input.bankAccountId ?? current.bankAccountId ?? "",
      cardId: effectiveType === "INCOME" ? undefined : (input.cardId ?? current.cardId),
      amount: input.amount ?? current.amount,
      currency: input.currency ?? current.currency,
    };

    const oldAccountId = current.bankAccountId;
    const oldLoaded = oldAccountId
      ? await loadAccountContext(this.accounts, userId, oldAccountId)
      : null;
    const oldAccount = oldLoaded?.context ?? null;
    let accountCreatedAt = oldLoaded?.createdAt ?? new Date();
    const oldCard =
      oldAccountId && current.cardId
        ? await this.cards.findOnAccount(userId, oldAccountId, current.cardId)
        : null;
    const oldCardLimit =
      oldCard?.kind === "CREDIT"
        ? await this.cardLimits.findForCardCurrency(userId, current.cardId!, current.currency)
        : null;
    const oldContribution =
      oldAccount != null
        ? MovementPolicy.contribution(
            { type: current.type, amount: current.amount },
            oldAccount,
            oldCard,
            oldCardLimit,
          )
        : "0";

    const oldLinkedToPaid = current.creditStatementId
      ? await this.statements.isPaid(current.creditStatementId)
      : false;

    let newContribution = "0";
    let newCard: Awaited<ReturnType<typeof this.cards.findOnAccount>> = null;
    const sameAccount = effective.bankAccountId === oldAccountId;
    if (effective.bankAccountId) {
      let account = sameAccount ? oldAccount : null;
      if (!account) {
        const newLoaded = await loadAccountContext(this.accounts, userId, effective.bankAccountId);
        account = newLoaded?.context ?? null;
        // The movement moved to a different account: its billing period must be
        // opened against THAT account's creation date, not the previous one's.
        if (newLoaded) accountCreatedAt = newLoaded.createdAt;
      }
      if (!account) throw new AccountNotFoundError();
      const card = effective.cardId
        ? await this.cards.findOnAccount(userId, effective.bankAccountId, effective.cardId)
        : null;
      newCard = card;
      const cardLimit =
        card?.kind === "CREDIT"
          ? await this.cardLimits.findForCardCurrency(userId, effective.cardId!, effective.currency)
          : null;
      const cardUsage = cardLimit
        ? await this.repo.sumsForCard(
            userId,
            effective.cardId!,
            effective.currency,
            currentCycleStart(account.billingCycleDay, new Date()),
            id,
          )
        : { income: "0", expense: "0" };
      newContribution = MovementPolicy.validate(
        effective,
        account,
        card,
        cardLimit,
        cardUsage,
        sameAccount ? oldContribution : "0",
        // Re-saving a movement already charged to THIS prepaid card must check
        // against the balance as it was before that charge, or editing it at all
        // would look like it doesn't fit.
        oldCard?.kind === "PREPAID" && oldCard.id === card?.id && current.type === "EXPENSE"
          ? current.amount
          : "0",
      );
    }

    const patch: TransactionPatch = {};
    if (input.type !== undefined) patch.type = input.type;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.occurredAt !== undefined) patch.occurredAt = new Date(input.occurredAt);
    if (input.category !== undefined) patch.category = input.category;
    if (input.description !== undefined) patch.description = input.description;
    if (input.observation !== undefined) patch.observation = input.observation;
    if (input.emisor !== undefined) patch.emisor = input.emisor;
    if (input.receptor !== undefined) patch.receptor = input.receptor;
    if (input.lugar !== undefined) patch.lugar = input.lugar;
    if (input.bankAccountId !== undefined) patch.bankAccountId = input.bankAccountId;
    if (input.cardId !== undefined || input.type !== undefined) {
      patch.cardId = effective.type === "INCOME" ? null : (effective.cardId ?? null);
    }

    const creditUsedDeltas: { accountId: string; delta: string }[] = [];
    if (!oldLinkedToPaid) {
      // Re-link (or unlink) the billing period this movement contributes to.
      if (sameAccount && oldContribution === "0" && newContribution !== "0" && oldAccountId) {
        patch.creditStatementId = (
          await this.statements.findOrCreateOpenForAccount(oldAccountId, accountCreatedAt)
        ).id;
      } else if (sameAccount && oldContribution !== "0" && newContribution === "0") {
        patch.creditStatementId = null;
      } else if (!sameAccount) {
        if (newContribution !== "0" && effective.bankAccountId) {
          patch.creditStatementId = (
            await this.statements.findOrCreateOpenForAccount(
              effective.bankAccountId,
              accountCreatedAt,
            )
          ).id;
        } else if (oldContribution !== "0") {
          patch.creditStatementId = null;
        }
      }

      if (oldAccountId && sameAccount) {
        const netDelta = subtractMoney(newContribution, oldContribution);
        if (netDelta !== "0") creditUsedDeltas.push({ accountId: oldAccountId, delta: netDelta });
      } else {
        if (oldAccountId && oldContribution !== "0") {
          creditUsedDeltas.push({
            accountId: oldAccountId,
            delta: subtractMoney("0", oldContribution),
          });
        }
        if (effective.bankAccountId && newContribution !== "0") {
          creditUsedDeltas.push({ accountId: effective.bankAccountId, delta: newContribution });
        }
      }
    }

    // The balance always moves, whatever the credit pool does: undo the old
    // movement on the old account, apply the new one on the (possibly different)
    // new account. Same account and same figures cancels out to nothing.
    const balanceDeltas: { accountId: string; delta: string }[] = [];
    if (oldAccountId) {
      balanceDeltas.push({
        accountId: oldAccountId,
        // A prepaid-card expense never moved this balance, so undoing it must not
        // credit the account with money it never lost.
        delta: subtractMoney("0", accountBalanceDelta(current.type, current.amount, oldCard?.kind)),
      });
    }
    if (effective.bankAccountId) {
      balanceDeltas.push({
        accountId: effective.bankAccountId,
        delta: accountBalanceDelta(effective.type, effective.amount, newCard?.kind),
      });
    }

    // Same shape as the balance: put the old charge back, take the new one off.
    // Two entries on the same card are fine — the adapter applies them in order.
    const prepaidDeltas: { cardId: string; delta: string }[] = [];
    if (oldCard?.kind === "PREPAID" && current.type === "EXPENSE") {
      prepaidDeltas.push({ cardId: oldCard.id, delta: current.amount });
    }
    if (newCard?.kind === "PREPAID") {
      const delta = MovementPolicy.prepaidDelta(effective, newCard);
      if (delta !== "0") prepaidDeltas.push({ cardId: newCard.id, delta });
    }

    return { current, patch, creditUsedDeltas, balanceDeltas, prepaidDeltas };
  }

  protected async handle(
    command: UpdateTransactionCommand,
    context: Context,
  ): Promise<HandleResult<transactions.Transaction>> {
    const row = await this.repo.saveUpdate(
      command.userId,
      command.id,
      context.patch,
      context.creditUsedDeltas,
      context.balanceDeltas,
      context.prepaidDeltas,
    );
    if (!row) throw new TransactionNotFoundError();
    return { result: row.toContract(), events: [] };
  }
}
