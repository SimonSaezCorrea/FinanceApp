import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";

import { currentCycleStart } from "../../../billing-settings/domain/billing-cycle";
import type { HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BaseIdempotentCommandHandler,
  type CompleteFn,
} from "../../../../infra/cqrs/base-idempotent-command.handler";
import {
  IDEMPOTENCY_RECORD_REPOSITORY,
  type IdempotencyRecordRepositoryPort,
} from "../../../idempotency-record/domain/ports/idempotency-record.repository.port";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import { cashDelta } from "../../domain/balance-delta";
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
 * the row itself (`saveNewWithTx`, FR-020).
 *
 * Retry-safe (Constitution Principle VII, form (c)): the write and the
 * idempotency record's COMPLETED mark commit in one `$transaction`, opened
 * here rather than inside the repository, so the two can be enlisted together
 * — same convention `installment-plan`'s `CreateInstallmentPlanHandler` uses.
 */
@Injectable()
@CommandHandler(CreateTransactionCommand)
export class CreateTransactionHandler extends BaseIdempotentCommandHandler<
  CreateTransactionCommand,
  transactions.Transaction,
  Context
> {
  protected readonly operation = "transaction.create";
  protected override readonly successStatus = 201;

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    @Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
    @Inject(CARD_LIMIT_REPOSITORY) private readonly cardLimits: CardLimitRepositoryPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY) private readonly statements: CreditStatementRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: CreateTransactionCommand): unknown {
    return command.input;
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
          currentCycleStart(account.billingCycleDay, account.billingCycleType, new Date()),
        )
      : { income: "0", expense: "0" };

    const contribution = MovementPolicy.validate(
      {
        type: input.type,
        bankAccountId: input.bankAccountId,
        cardId: input.cardId,
        amount: input.amount,
        currency: input.currency,
        financeCharge: input.financeCharge,
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

  protected async handleIdempotent(
    command: CreateTransactionCommand,
    context: Context,
    complete: CompleteFn<transactions.Transaction>,
  ): Promise<HandleResult<transactions.Transaction>> {
    const { input } = command;
    const cashBalance = cashDelta(input.type, input.amount, context.account, context.card);
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
      financeCharge: input.financeCharge,
      creditStatementId: context.creditStatementId,
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const row = await this.repo.saveNewWithTx(
        tx,
        command.userId,
        plan,
        context.contribution !== "0"
          ? { accountId: input.bankAccountId, delta: context.contribution }
          : null,
        // The account's cash balance follows every movement that actually
        // moves cash, so it never needs a manual reconciliation: income adds,
        // expense subtracts. A prepaid card is no exception — the money lives
        // in ITS account, same as a debit card's. A CREDIT-kind card is:
        // nothing leaves the account until its statement is paid (`cashDelta`).
        cashBalance !== "0" ? [{ accountId: input.bankAccountId, delta: cashBalance }] : [],
      );
      const contract = row.toContract();
      // MUST be in this same transaction: it is what makes a crash between the
      // write and this mark impossible to observe as "applied but un-marked".
      await complete(tx, contract);
      return contract;
    });

    return { result, events: [] };
  }
}
