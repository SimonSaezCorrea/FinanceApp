import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { toMoney } from "@finance/money";

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
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../domain/ports/installment-plan.repository.port";
import { loadPlanDeletionReversal } from "../plan-deletion.loader";
import type { PlanDeletionReversal } from "../plan-deletion";
import { RemoveInstallmentPlanCommand } from "./remove-installment-plan.command";

interface Context {
  userId: string;
  planId: string;
  reversal: PlanDeletionReversal;
}

/**
 * Deleting a plan reverses its WHOLE money history (FR-050a): the expenses its
 * instalments created disappear, the accounts that paid them get their balance back,
 * the finance charge for its interest goes with them and the pool it filled is
 * released — and only then does the plan itself go, taking its instalments by
 * cascade.
 *
 * All of it in one `prisma.$transaction`, for the same reason paying an instalment
 * is: a plan deleted whose expenses survived leaves movements pointing at nothing,
 * and balances given back on a plan that is still there is money invented.
 */
@Injectable()
@CommandHandler(RemoveInstallmentPlanCommand)
export class RemoveInstallmentPlanHandler extends BaseCommandHandler<
  RemoveInstallmentPlanCommand,
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

  protected async loadContext(command: RemoveInstallmentPlanCommand): Promise<Context> {
    const plan = await this.repo.findOne(command.userId, command.id);
    if (!plan) throw new InstallmentPlanNotFoundError();
    // The same computation the confirmation showed the user (FR-050b) — one function,
    // so what was promised is what happens.
    const reversal = await loadPlanDeletionReversal(
      command.userId,
      command.id,
      this.transactions,
      this.accounts,
    );
    return { userId: command.userId, planId: command.id, reversal };
  }

  protected async handle(): Promise<HandleResult<void>> {
    return { result: undefined, events: [] };
  }

  protected override async persist(context: Context): Promise<void> {
    const { reversal } = context;
    await this.prisma.$transaction(async (tx) => {
      await this.transactions.deleteManyWithTx(tx, reversal.movementIds);
      for (const { accountId, amount } of reversal.balanceRestorations) {
        if (toMoney(amount).isZero()) continue;
        await this.accounts.incrementBalanceWithTx(tx, accountId, amount);
      }
      for (const { accountId, delta } of reversal.creditReversals) {
        if (toMoney(delta).isZero()) continue;
        await this.accounts.incrementCreditUsedWithTx(tx, accountId, delta);
      }
      await this.repo.removeWithTx(tx, context.userId, context.planId);
    });
  }
}
