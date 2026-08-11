import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";
import { toMoney } from "@finance/money";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import type { BankAccount } from "../../../bank-account/domain/bank-account.aggregate";
import { AccountNotFoundError } from "../../../bank-account/domain/errors";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  TRANSACTION_SUMS_REPOSITORY,
  type TransactionSumsRepositoryPort,
} from "../../../transaction/domain/ports/transaction-sums.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import type { CreditStatement } from "../../domain/credit-statement.aggregate";
import { StatementNotFoundError } from "../../domain/errors";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../domain/ports/credit-statement.repository.port";
import { toStatementDto } from "../statement-dto.mapper";
import { SyncStatementCommand } from "./sync-statement.command";

interface Context {
  account: BankAccount;
  statement: CreditStatement;
  /** Movements dated inside the period belong to it, whatever they were linked to. */
  from: Date;
  to: Date;
  /** `null` = every movement on the account counts (a standalone credit line). */
  cardIds: string[] | null;
  recomputedAmount: string;
  /** How much the payment movement (and the credit pool) must change by. */
  paidDelta: string;
  breakdown: { purchases: string; installments: string; installmentCount: number };
}

export type SyncedStatementResult = accounts.CreditStatement;

/**
 * Reconcile a billing period with reality, replacing the old "type the right
 * number in by hand" correction.
 *
 * What drifts, and why this exists:
 * - A movement is linked to whichever period was OPEN when it was created, and
 *   never re-linked afterwards — so back-dating one, or editing its date, leaves
 *   it counted in the wrong period.
 * - Editing a movement of an already-PAID period deliberately leaves the credit
 *   pool alone (it was settled), so the pool can fall out of step with it.
 *
 * The sync recomputes the period from its DATE WINDOW, re-links those movements
 * to it, and — when the period was already settled — updates the payment movement
 * to the new figure and corrects `creditUsed` by the same delta. All of it in one
 * database transaction, so a period is never left half-reconciled.
 */
@Injectable()
@CommandHandler(SyncStatementCommand)
export class SyncStatementHandler extends BaseCommandHandler<
  SyncStatementCommand,
  SyncedStatementResult,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(CREDIT_STATEMENT_REPOSITORY)
    private readonly statementRepo: CreditStatementRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(TRANSACTION_SUMS_REPOSITORY) private readonly sums: TransactionSumsRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: SyncStatementCommand): Promise<Context> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();
    const statement = await this.statementRepo.findById(
      command.userId,
      command.accountId,
      command.statementId,
    );
    if (!statement) throw new StatementNotFoundError();

    // An open period runs up to now; a closed one stops where it was sealed.
    const from = statement.periodStart;
    const to = statement.closedAt ?? new Date();
    // Same scoping the live credit-pool sums use: on a standalone credit line
    // every movement is a credit-line movement; on any other account only the
    // spend through a CREDIT card that shares the pool belongs to the statement.
    const snap = account.snapshot();
    const cardIds =
      snap.type === "CREDIT_LINE"
        ? null
        : snap.cards.filter((c) => c.kind === "CREDIT").map((c) => c.id);

    const [recomputedAmount, breakdown] = await Promise.all([
      this.sums.netForPeriod({ accountId: account.id, cardIds, from, to }),
      this.statementRepo.breakdown(statement.id),
    ]);

    return {
      account,
      statement,
      from,
      to,
      cardIds,
      recomputedAmount,
      paidDelta: "0",
      breakdown,
    };
  }

  protected async handle(
    _command: SyncStatementCommand,
    context: Context,
  ): Promise<HandleResult<SyncedStatementResult>> {
    const { paidDelta } = context.statement.syncAmount(context.recomputedAmount);
    context.paidDelta = paidDelta;
    // A settled period that turned out bigger means MORE of the pool was really
    // used than the payment released — and vice versa. Editing those movements
    // left the pool untouched on purpose, so this is where it gets corrected.
    if (!toMoney(paidDelta).isZero()) {
      context.account.adjustCreditUsed(toMoney(paidDelta).negated().toString());
    }
    return {
      result: toStatementDto(context.statement, {
        amount: context.recomputedAmount,
        breakdown: context.breakdown,
        minimumPercent: context.account.minimumPaymentPercent,
      }),
      events: [],
    };
  }

  /** Statement + its movements + the payment + the account's pool, atomically. */
  protected override async persist(context: Context): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.transactions.relinkToStatementWithTx(tx, {
        statementId: context.statement.id,
        accountId: context.account.id,
        cardIds: context.cardIds,
        from: context.from,
        to: context.to,
      });
      const paymentId = context.statement.paidTransactionId;
      // Only a settled period has a payment movement to keep in step.
      if (paymentId && context.statement.paidAt) {
        await this.transactions.updateAmountWithTx(tx, paymentId, context.statement.paidAmount);
      }
      await this.statementRepo.saveWithTx(tx, context.statement);
      if (!toMoney(context.paidDelta).isZero()) {
        await this.accountRepo.saveWithTx(tx, context.account);
      }
    });
  }
}
