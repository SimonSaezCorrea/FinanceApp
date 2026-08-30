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
import { UpdateStatementPaymentCommand } from "./update-statement-payment.command";

interface Context {
  account: BankAccount;
  statement: CreditStatement;
  breakdown: { purchases: string; installments: string; installmentCount: number };
  /** New minus old: what the payment movement, the source balance and the pool move by. */
  paidDelta: string;
  /** What the period still leaves unpaid AFTER the correction. */
  carryOver: string;
}

export type UpdatedStatementPaymentResult = accounts.CreditStatement;

/**
 * Corrects what was actually paid on an already-settled period — the figure was
 * mistyped, or more was transferred afterwards.
 *
 * Deliberately NOT the retired manual "correct the period's amount": the period's
 * total still comes from its real movements (`POST .../sync`). Only the payment
 * moves here, and everything that was derived from it moves with it, in one
 * `prisma.$transaction`:
 * - the payment movement's amount (the user sees the real figure in Movimientos),
 * - the source account's balance (that expense is what left it),
 * - the credit account's `creditUsed` (only what was paid is released),
 * - the shortfall carried into the next period, which is where the rest is owed.
 *
 * Paying the period's full total makes it PAID again; anything less keeps it
 * PARTIALLY_PAID with the remainder carried forward.
 */
@Injectable()
@CommandHandler(UpdateStatementPaymentCommand)
export class UpdateStatementPaymentHandler extends BaseCommandHandler<
  UpdateStatementPaymentCommand,
  UpdatedStatementPaymentResult,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(CREDIT_STATEMENT_REPOSITORY)
    private readonly statementRepo: CreditStatementRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateStatementPaymentCommand): Promise<Context> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();
    const statement = await this.statementRepo.findById(
      command.userId,
      command.accountId,
      command.statementId,
    );
    if (!statement) throw new StatementNotFoundError();
    const breakdown = await this.statementRepo.breakdown(statement.id);
    return { account, statement, breakdown, paidDelta: "0", carryOver: "0" };
  }

  protected async handle(
    command: UpdateStatementPaymentCommand,
    context: Context,
  ): Promise<HandleResult<UpdatedStatementPaymentResult>> {
    // The aggregate is what rejects a non-positive figure, one above the period's
    // total, or a period that was never settled in the first place.
    const { paidDelta, carryOver } = context.statement.changePaidAmount(command.amount);
    context.paidDelta = paidDelta;
    context.carryOver = carryOver;
    // Paying MORE releases more of the pool; correcting downwards puts it back.
    context.account.adjustCreditUsed(toMoney(paidDelta).negated().toString());
    return {
      result: toStatementDto(context.statement, {
        amount: context.statement.amount,
        breakdown: context.breakdown,
        minimumPercent: context.account.minimumPaymentPercent,
        paymentDueDay: context.account.paymentDueDay,
        paymentDueCycleType: context.account.paymentDueCycleType,
      }),
      events: [],
    };
  }

  protected override async persist(context: Context): Promise<void> {
    const delta = toMoney(context.paidDelta);
    if (delta.isZero()) return;
    await this.prisma.$transaction(async (tx) => {
      const paymentId = context.statement.paidTransactionId;
      if (paymentId) {
        await this.transactions.updateAmountWithTx(tx, paymentId, context.statement.paidAmount);
      }
      // The payment is an EXPENSE on the source account: a bigger payment means a
      // lower balance there. Without this the movement and the balance disagree.
      const fromAccountId = context.statement.paidFromAccountId;
      if (fromAccountId) {
        await this.accountRepo.incrementBalanceWithTx(
          tx,
          fromAccountId,
          delta.negated().toString(),
        );
      }
      // The shortfall is owed in the NEXT period, so correcting the payment has to
      // correct that figure too — by the opposite of the delta (paying 1000 more
      // leaves 1000 less to carry). The receiving period may not exist yet: a
      // period originally paid in full recorded no successor.
      const target = await this.resolveCarryOverTarget(tx, context);
      if (target) {
        await this.statementRepo.addCarriedOverWithTx(tx, target, delta.negated().toString());
      }
      await this.statementRepo.saveWithTx(tx, context.statement);
      await this.accountRepo.saveWithTx(tx, context.account);
    });
  }

  /** Where this period's shortfall lives: the successor it already recorded, or —
   * when the correction turned a fully-paid period into a short one — a newly
   * resolved successor, recorded on the statement before it is saved. */
  private async resolveCarryOverTarget(tx: unknown, context: Context): Promise<string | null> {
    const existing = context.statement.carriedToId;
    if (existing) return existing;
    if (!toMoney(context.carryOver).greaterThan(0)) return null;
    const target = await this.statementRepo.findOrCreateCarryOverTargetWithTx(tx, {
      accountId: context.account.id,
      excludeStatementId: context.statement.id,
      periodStart: context.statement.closedAt ?? context.statement.periodStart,
    });
    context.statement.markCarriedTo(target.id);
    return target.id;
  }
}
