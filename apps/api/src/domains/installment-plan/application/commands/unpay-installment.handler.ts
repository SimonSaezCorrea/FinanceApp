import { addMoney } from "@finance/money";
import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import { InstallmentPlanNotFoundError } from "../../domain/errors";
import type { CarryDelta } from "../../domain/installment-carry-over";
import type { InstallmentPlan } from "../../domain/installment-plan.aggregate";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../domain/ports/installment-plan.repository.port";
import { UnpayInstallmentCommand } from "./unpay-installment.command";

interface Context {
  plan: InstallmentPlan;
  sequence: number;
  /** The expense to delete, when the payment created one. */
  transactionId: string | null;
  /** The account whose balance must be restored, and by how much. */
  refundAccountId: string | null;
  refundAmount: string;
  carryDeltas: CarryDelta[];
}

/**
 * Undoing a payment — the exact mirror of making one (FR-024): the instalment is
 * cleared, the expense deleted, the balance restored and the carry-over reversed, all
 * inside one transaction.
 *
 * "The carry-over" means the one THIS payment caused. Whatever this instalment
 * inherited from an earlier short payment stays: that debt belongs to a payment that
 * still stands, and clearing it here would quietly forgive it.
 */
@Injectable()
@CommandHandler(UnpayInstallmentCommand)
export class UnpayInstallmentHandler extends BaseCommandHandler<
  UnpayInstallmentCommand,
  void,
  Context
> {
  constructor(
    eventBus: EventBus,
    private readonly prisma: PrismaService,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly repo: InstallmentPlanRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UnpayInstallmentCommand): Promise<Context> {
    const plan = await this.repo.findOne(command.userId, command.planId);
    if (!plan) throw new InstallmentPlanNotFoundError();
    return {
      plan,
      sequence: command.sequence,
      transactionId: null,
      refundAccountId: null,
      refundAmount: "0",
      carryDeltas: [],
    };
  }

  protected async handle(
    command: UnpayInstallmentCommand,
    context: Context,
  ): Promise<HandleResult<void>> {
    const result = context.plan.unpayInstallment(context.sequence);
    context.transactionId = result.transactionId;
    context.refundAmount = result.refundAmount;
    context.carryDeltas = result.carryDeltas;

    if (result.transactionId) {
      // The expense knows which account it came out of; the plan's remembered account
      // may have changed since, and restoring the balance of the WRONG account would
      // be worse than not restoring it at all.
      context.refundAccountId = await this.transactions.accountIdForTransaction(
        command.userId,
        result.transactionId,
      );
    }
    return { result: undefined, events: [] };
  }

  protected override async persist(context: Context): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (context.transactionId) {
        await this.transactions.deleteWithTx(tx, context.transactionId);
      }
      if (context.refundAccountId) {
        await this.accounts.incrementBalanceWithTx(
          tx,
          context.refundAccountId,
          addMoney("0", context.refundAmount),
        );
      }
      await this.repo.savePaymentWithTx(tx, context.plan, context.sequence, context.carryDeltas);
    });
  }
}
