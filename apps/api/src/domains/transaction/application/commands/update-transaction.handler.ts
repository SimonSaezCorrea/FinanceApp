import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { accounts, transactions } from "@finance/contracts";
import { subtractMoney } from "@finance/money";

import { currentCycleStart } from "../../../billing-settings/domain/billing-cycle";
import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { cashDelta, reverseCashDelta } from "../../domain/balance-delta";
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
  INSTALLMENT_PAYMENT_LOOKUP,
  type InstallmentPaymentLookupPort,
} from "../../../installment-payment/domain/ports/installment-payment-lookup.port";
import {
  AccountNotFoundError,
  TransactionLinkedToInstallmentError,
  TransactionNotFoundError,
  TransferEditAsPairError,
} from "../../domain/errors";
import {
  MovementPolicy,
  type AccountContext,
  type EffectiveMovement,
} from "../../domain/movement-policy";
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
    @Inject(INSTALLMENT_PAYMENT_LOOKUP)
    private readonly installmentPayments: InstallmentPaymentLookupPort,
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
    // This row's amount IS an instalment's payment: it is corrected by undoing and
    // re-paying that instalment, never edited here (FR-028a). Spec 014, FR-024: a
    // plan's PURCHASE movement carries `installmentPlanId` directly on its own row
    // — never linked via `installmentPayment.transactionId` (that link is for a
    // PAYMENT, not a purchase), so the lookup alone would miss it.
    if (
      current.snapshot().installmentPlanId !== null ||
      (await this.installmentPayments.isLinkedToPayment(userId, id))
    ) {
      throw new TransactionLinkedToInstallmentError();
    }

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
    // Hoisted out of the block below: the cash delta needs to know what the
    // movement is charged to on BOTH sides of the edit, not just its pool.
    let newAccount: AccountContext | null = null;
    let newCard: { kind: accounts.CardKind } | null = null;
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
      newAccount = account;
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
            currentCycleStart(account.billingCycleDay, account.billingCycleType, new Date()),
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
        // Re-saving a movement already charged to THIS account must check against
        // the balance as it was BEFORE that charge, or editing it at all would look
        // like it doesn't fit. Only matters for a prepaid account, the one type the
        // policy bounds.
        sameAccount && current.type === "EXPENSE" ? current.amount : "0",
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

    // Cash moves independently of the credit pool: undo the old movement on the
    // old account, apply the new one on the (possibly different) new account.
    // Same account and same figures cancels out to nothing. A movement charged
    // to a credit line contributes "0" on its side, so switching a purchase from
    // a debit card to a credit one refunds the balance and vice versa.
    const balanceDeltas: { accountId: string; delta: string }[] = [];
    const oldCash = oldAccountId
      ? reverseCashDelta(current.type, current.amount, oldAccount, oldCard)
      : "0";
    if (oldAccountId && oldCash !== "0") {
      balanceDeltas.push({ accountId: oldAccountId, delta: oldCash });
    }
    const newCash = effective.bankAccountId
      ? cashDelta(effective.type, effective.amount, newAccount, newCard)
      : "0";
    if (effective.bankAccountId && newCash !== "0") {
      balanceDeltas.push({ accountId: effective.bankAccountId, delta: newCash });
    }

    return { current, patch, creditUsedDeltas, balanceDeltas };
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
    );
    if (!row) throw new TransactionNotFoundError();
    return { result: row.toContract(), events: [] };
  }
}
