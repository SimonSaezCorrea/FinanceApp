import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";
import { toMoney } from "@finance/money";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import type { BankAccount } from "../../domain/bank-account.aggregate";
import {
  AccountNotFoundError,
  CardNotFoundError,
  InvalidPrepaidBalanceError,
  PrepaidBalanceNotAllowedError,
} from "../../domain/errors";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../domain/ports/bank-account.repository.port";
import { cardToDto } from "../queries/account-dto.mapper";
import { LoadPrepaidCardCommand } from "./load-prepaid-card.command";

interface Context {
  account: BankAccount;
  card: BankAccount["cards"][number];
  amount: string;
  occurredAt: Date;
  transactionId: string;
}

/**
 * Loads a prepaid card: the money leaves the ACCOUNT as a real EXPENSE movement
 * (visible in Movimientos like any other) and lands on the CARD's own balance, in
 * one `prisma.$transaction`.
 *
 * That split is the whole point of the prepaid model: the load is where the money
 * leaves the account, so spending with the card afterwards moves only the card's
 * pot — counting both would subtract the same money twice. The load movement
 * deliberately carries NO `cardId`: with one it would be indistinguishable from
 * spending through the card, which is exactly what must not touch the account
 * balance.
 */
@Injectable()
@CommandHandler(LoadPrepaidCardCommand)
export class LoadPrepaidCardHandler extends BaseCommandHandler<
  LoadPrepaidCardCommand,
  accounts.Card,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: LoadPrepaidCardCommand): Promise<Context> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();
    const card = account.findCardOrThrow(command.cardId);
    // Only a prepaid card HAS a balance to load — a credit card is paid, a debit
    // card spends the account's own money.
    if (card.kind !== "PREPAID") throw new PrepaidBalanceNotAllowedError();
    if (!toMoney(command.amount).greaterThan(0)) throw new InvalidPrepaidBalanceError();
    return {
      account,
      card,
      amount: command.amount,
      occurredAt: command.occurredAt ?? new Date(),
      transactionId: randomUUID(),
    };
  }

  protected async handle(
    _command: LoadPrepaidCardCommand,
    context: Context,
  ): Promise<HandleResult<accounts.Card>> {
    const snap = context.account.snapshot();
    await this.prisma.$transaction(async (tx) => {
      await this.transactions.createWithTx(tx, {
        id: context.transactionId,
        userId: snap.userId,
        bankAccountId: snap.id,
        type: "EXPENSE",
        amount: context.amount,
        currency: snap.currency,
        occurredAt: context.occurredAt,
        category: "Recarga prepago",
        description: context.card.name,
      });
      await this.accountRepo.incrementBalanceWithTx(
        tx,
        snap.id,
        toMoney(context.amount).negated().toString(),
      );
      await this.cards.incrementPrepaidBalanceWithTx(tx, context.card.id, context.amount);
    });
    const reloaded = await this.accountRepo.findById(snap.userId, snap.id);
    const card = reloaded?.cards.find((c) => c.id === context.card.id);
    if (!card) throw new CardNotFoundError();
    return { result: cardToDto(card, snap.currency), events: [] };
  }
}
