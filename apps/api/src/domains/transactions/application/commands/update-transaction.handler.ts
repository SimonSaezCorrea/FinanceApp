import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";
import { subtractMoney } from "@finance/money";

import { currentCycleStart } from "../../../accounts/domain/billing-cycle";
import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { AccountNotFoundError, TransactionNotFoundError } from "../../domain/errors";
import { MovementPolicy, type EffectiveMovement } from "../../domain/movement-policy";
import type { Transaction, TransactionPatch } from "../../domain/transaction.aggregate";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
} from "../../domain/ports/transaction.repository.port";
import { UpdateTransactionCommand } from "./update-transaction.command";

interface Context {
  current: Transaction;
  patch: TransactionPatch;
  creditUsedDeltas: { accountId: string; delta: string }[];
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
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateTransactionCommand): Promise<Context> {
    const { input, userId, id } = command;
    const current = await this.repo.findOne(userId, id);
    if (!current) throw new TransactionNotFoundError();

    const effectiveType = input.type ?? current.type;
    const effective: EffectiveMovement = {
      type: effectiveType,
      bankAccountId: input.bankAccountId ?? current.bankAccountId ?? "",
      cardId: effectiveType === "INCOME" ? undefined : (input.cardId ?? current.cardId),
      amount: input.amount ?? current.amount,
      currency: input.currency ?? current.currency,
    };

    const oldAccountId = current.bankAccountId;
    const oldAccount = oldAccountId ? await this.repo.findAccount(userId, oldAccountId) : null;
    const oldCard =
      oldAccountId && current.cardId ? await this.repo.findCardInAccount(userId, current.cardId, oldAccountId) : null;
    const oldCardLimit =
      oldCard?.kind === "CREDIT" ? await this.repo.findCardLimit(userId, current.cardId!, current.currency) : null;
    const oldContribution =
      oldAccount != null
        ? MovementPolicy.contribution({ type: current.type, amount: current.amount }, oldAccount, oldCard, oldCardLimit)
        : "0";

    const oldLinkedToPaid = current.creditStatementId ? await this.repo.isStatementPaid(current.creditStatementId) : false;

    let newContribution = "0";
    const sameAccount = effective.bankAccountId === oldAccountId;
    if (effective.bankAccountId) {
      const account =
        sameAccount && oldAccount ? oldAccount : await this.repo.findAccount(userId, effective.bankAccountId);
      if (!account) throw new AccountNotFoundError();
      const card = effective.cardId
        ? await this.repo.findCardInAccount(userId, effective.cardId, effective.bankAccountId)
        : null;
      const cardLimit =
        card?.kind === "CREDIT" ? await this.repo.findCardLimit(userId, effective.cardId!, effective.currency) : null;
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
        patch.creditStatementId = (await this.repo.findOrCreateOpenStatement(oldAccountId)).id;
      } else if (sameAccount && oldContribution !== "0" && newContribution === "0") {
        patch.creditStatementId = null;
      } else if (!sameAccount) {
        if (newContribution !== "0" && effective.bankAccountId) {
          patch.creditStatementId = (await this.repo.findOrCreateOpenStatement(effective.bankAccountId)).id;
        } else if (oldContribution !== "0") {
          patch.creditStatementId = null;
        }
      }

      if (oldAccountId && sameAccount) {
        const netDelta = subtractMoney(newContribution, oldContribution);
        if (netDelta !== "0") creditUsedDeltas.push({ accountId: oldAccountId, delta: netDelta });
      } else {
        if (oldAccountId && oldContribution !== "0") {
          creditUsedDeltas.push({ accountId: oldAccountId, delta: subtractMoney("0", oldContribution) });
        }
        if (effective.bankAccountId && newContribution !== "0") {
          creditUsedDeltas.push({ accountId: effective.bankAccountId, delta: newContribution });
        }
      }
    }

    return { current, patch, creditUsedDeltas };
  }

  protected async handle(
    command: UpdateTransactionCommand,
    context: Context,
  ): Promise<HandleResult<transactions.Transaction>> {
    const row = await this.repo.saveUpdate(command.userId, command.id, context.patch, context.creditUsedDeltas);
    if (!row) throw new TransactionNotFoundError();
    return { result: row.toContract(), events: [] };
  }
}
