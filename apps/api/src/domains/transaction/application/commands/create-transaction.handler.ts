import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";

import { currentCycleStart } from "../../../billing-settings/domain/billing-cycle";
import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { accountBalanceDelta } from "../../domain/balance-delta";
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
import { AccountNotFoundError } from "../../domain/errors";
import type { AccountContext, CardContext, CardLimitContext } from "../../domain/movement-policy";
import { MovementPolicy } from "../../domain/movement-policy";
import { Transaction } from "../../domain/transaction.aggregate";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
} from "../../domain/ports/transaction.repository.port";
import { loadAccountContext } from "../account-context.loader";
import { CreateTransactionCommand } from "./create-transaction.command";

interface Context {
  account: AccountContext;
  card: CardContext | null;
  cardLimit: CardLimitContext | null;
  contribution: string;
  creditStatementId: string | null;
}

/**
 * Creates a movement, enforcing the movement rules (`MovementPolicy`) and, if
 * it draws on a shared credit pool, linking it to the account's currently
 * OPEN billing period and persisting the `creditUsed` delta atomically with
 * the row itself (`saveNew`, FR-020) — the actual repository write happens in
 * `handle()` (same convention `accounts`' `CreateAccountHandler` uses), so
 * `persist()` stays the default no-op.
 */
@Injectable()
@CommandHandler(CreateTransactionCommand)
export class CreateTransactionHandler extends BaseCommandHandler<
  CreateTransactionCommand,
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

  protected async loadContext(command: CreateTransactionCommand): Promise<Context> {
    const { input } = command;
    const loaded = await loadAccountContext(this.accounts, command.userId, input.bankAccountId);
    if (!loaded) throw new AccountNotFoundError();
    const { context: account, createdAt: accountCreatedAt } = loaded;

    const card = input.cardId
      ? await this.cards.findOnAccount(command.userId, input.bankAccountId, input.cardId)
      : null;
    const cardLimit =
      card?.kind === "CREDIT"
        ? await this.cardLimits.findForCardCurrency(command.userId, input.cardId!, input.currency)
        : null;
    const cardUsage = cardLimit
      ? await this.repo.sumsForCard(
          command.userId,
          input.cardId!,
          input.currency,
          currentCycleStart(account.billingCycleDay, new Date()),
        )
      : { income: "0", expense: "0" };

    const contribution = MovementPolicy.validate(
      {
        type: input.type,
        bankAccountId: input.bankAccountId,
        cardId: input.cardId,
        amount: input.amount,
        currency: input.currency,
      },
      account,
      card,
      cardLimit,
      cardUsage,
    );
    // Contributing movements link live to whichever billing period is
    // currently OPEN for the account — creates one if this is the first
    // contribution since the last close (see `CreditStatement`).
    const creditStatementId =
      contribution !== "0"
        ? (await this.statements.findOrCreateOpenForAccount(input.bankAccountId, accountCreatedAt))
            .id
        : null;

    return { account, card, cardLimit, contribution, creditStatementId };
  }

  protected async handle(
    command: CreateTransactionCommand,
    context: Context,
  ): Promise<HandleResult<transactions.Transaction>> {
    const { input } = command;
    const plan = Transaction.planCreation({
      userId: command.userId,
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      occurredAt: new Date(input.occurredAt),
      category: input.category,
      description: input.description,
      observation: input.observation,
      emisor: input.emisor,
      receptor: input.receptor,
      lugar: input.lugar,
      bankAccountId: input.bankAccountId,
      cardId: input.cardId,
      creditStatementId: context.creditStatementId,
    });
    const row = await this.repo.saveNew(
      command.userId,
      plan,
      context.contribution !== "0"
        ? { accountId: input.bankAccountId, delta: context.contribution }
        : null,
      // The account's cash balance follows every movement, so it never needs a
      // manual reconciliation: income adds, expense subtracts — except through a
      // PREPAID card, whose own pot is what moves (the account paid when it was
      // loaded).
      [
        {
          accountId: input.bankAccountId,
          delta: accountBalanceDelta(input.type, input.amount, context.card?.kind),
        },
      ],
      context.card
        ? [
            {
              cardId: context.card.id,
              delta: MovementPolicy.prepaidDelta(
                { type: input.type, amount: input.amount },
                context.card,
              ),
            },
          ]
        : [],
    );
    return { result: row.toContract(), events: [] };
  }
}
