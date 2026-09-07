import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { savings } from "@finance/contracts";

import type { HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BaseIdempotentCommandHandler,
  type CompleteFn,
} from "../../../../infra/cqrs/base-idempotent-command.handler";
import { generateRowId } from "../../../../infra/id/generate-row-id";
import {
  IDEMPOTENCY_RECORD_REPOSITORY,
  type IdempotencyRecordRepositoryPort,
} from "../../../idempotency-record/domain/ports/idempotency-record.repository.port";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import type { BankAccount } from "../../../bank-account/domain/bank-account.aggregate";
import { AccountNotFoundError } from "../../../bank-account/domain/errors";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import { MovementPolicy } from "../../../transaction/domain/movement-policy";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import {
  SavingsEntryFromCreditAccountError,
  SavingsEntryCurrencyMismatchError,
} from "../../../savings-entry/domain/errors";
import {
  SAVINGS_ENTRY_REPOSITORY,
  type SavingsEntryRepositoryPort,
} from "../../../savings-entry/domain/ports/savings-entry.repository.port";
import {
  SavingsGoalNotFoundError,
  SavingsGoalTargetCurrencyMismatchError,
  SavingsGoalTargetNotOpenError,
} from "../../domain/errors";
import { isSavingsGoalCloseable } from "../../domain/savings-goal-closeable";
import { computePace } from "../../domain/savings-pace";
import {
  SAVINGS_GOAL_REPOSITORY,
  type SavingsGoalRepositoryPort,
} from "../../domain/ports/savings-goal.repository.port";
import { CloseSavingsGoalCommand } from "./close-savings-goal.command";

interface Context {
  /** Only resolved for `WITHDRAW_TO_ACCOUNT`. */
  account: BankAccount | null;
}

/**
 * Closes a goal that is cumplida/vencida with the chosen destino — real money
 * only for `WITHDRAW_TO_ACCOUNT` (an INCOME on the destination account, the
 * goal's full `savedAmount`), following the exact
 * `register-debt-payment.handler.ts` skeleton: the read-modify-write of the
 * `SavingsGoal` happens `FOR UPDATE` INSIDE the same transaction as the
 * effect, never in `loadContext`, so two concurrent closes of the same goal
 * can't race each other into two withdrawals.
 */
@Injectable()
@CommandHandler(CloseSavingsGoalCommand)
export class CloseSavingsGoalHandler extends BaseIdempotentCommandHandler<
  CloseSavingsGoalCommand,
  savings.SavingsGoal,
  Context
> {
  protected readonly operation = "savingsGoal.close";
  protected override readonly successStatus = 200;

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    @Inject(SAVINGS_GOAL_REPOSITORY) private readonly repo: SavingsGoalRepositoryPort,
    @Inject(SAVINGS_ENTRY_REPOSITORY) private readonly entries: SavingsEntryRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: CloseSavingsGoalCommand): unknown {
    return { id: command.id, ...command.input };
  }

  protected async loadContext(command: CloseSavingsGoalCommand): Promise<Context> {
    if (command.input.destination !== "WITHDRAW_TO_ACCOUNT") return { account: null };
    const account = await this.accounts.findById(command.userId, command.input.accountId);
    if (!account) throw new AccountNotFoundError();
    if (account.snapshot().type === "CREDIT_CARD") throw new SavingsEntryFromCreditAccountError();
    return { account };
  }

  protected async handleIdempotent(
    command: CloseSavingsGoalCommand,
    context: Context,
    complete: CompleteFn<savings.SavingsGoal>,
  ): Promise<HandleResult<savings.SavingsGoal>> {
    const { userId, input } = command;
    const now = new Date();
    const closedAt = input.closedAt ? new Date(input.closedAt) : now;

    const result = await this.prisma.$transaction(async (tx) => {
      const goal = await this.repo.findOneForUpdateWithTx(tx, userId, command.id);
      if (!goal) throw new SavingsGoalNotFoundError();
      const goalSnap = goal.snapshot();

      const sums = (await this.entries.sumsByGoal(userId, [goal.id], now)).get(goal.id) ?? {
        total: "0",
        lastThreeMonthsTotal: "0",
      };
      const closeable = isSavingsGoalCloseable(
        sums.total,
        goalSnap.targetAmount,
        goalSnap.deadline,
        now,
      );

      let finalSaved = sums.total;
      let finalPace = computePace(sums.lastThreeMonthsTotal, goalSnap.createdAt, now);

      if (input.destination === "WITHDRAW_TO_ACCOUNT") {
        const account = context.account!.snapshot();
        if (account.currency !== goalSnap.currency) throw new SavingsEntryCurrencyMismatchError();
        const transactionId = generateRowId();
        MovementPolicy.assertWithinCeiling({ type: "INCOME", amount: sums.total }, account);
        goal.close(closeable, {
          destination: "WITHDRAW_TO_ACCOUNT",
          closedAt,
          withdrawal: { transactionId, accountId: account.id, amount: sums.total },
        });
        await this.transactions.createWithTx(tx, {
          id: transactionId,
          userId,
          bankAccountId: account.id,
          type: "INCOME",
          amount: sums.total,
          currency: account.currency,
          occurredAt: closedAt,
          category: "Ahorro",
          description: `Retiro de meta «${goalSnap.title}»`,
          savingsGoalId: goal.id,
        });
        await this.accounts.incrementBalanceWithTx(tx, account.id, sums.total);
        // savedAmount/pace stay as computed above — this destination leaves
        // the goal's own aportes untouched.
      } else if (input.destination === "FREE_SAVINGS") {
        goal.close(closeable, { destination: "FREE_SAVINGS", closedAt });
        await this.entries.reassignGoalWithTx(tx, userId, goal.id, null);
        finalSaved = "0";
        finalPace = "0";
      } else {
        const target = await this.repo.findOne(userId, input.targetGoalId);
        if (!target) throw new SavingsGoalNotFoundError();
        const targetSnap = target.snapshot();
        if (targetSnap.closedAt !== null || target.id === goal.id) {
          throw new SavingsGoalTargetNotOpenError();
        }
        if (targetSnap.currency !== goalSnap.currency) {
          throw new SavingsGoalTargetCurrencyMismatchError();
        }
        goal.close(closeable, {
          destination: "TRANSFER_TO_GOAL",
          closedAt,
          targetGoalId: target.id,
        });
        await this.entries.reassignGoalWithTx(tx, userId, goal.id, target.id);
        finalSaved = "0";
        finalPace = "0";
      }

      const contract = goal.toContract({ savedAmount: finalSaved, pace: finalPace });
      await this.repo.saveWithTx(tx, goal);
      await complete(tx, contract);
      return contract;
    });
    return { result, events: [] };
  }
}
