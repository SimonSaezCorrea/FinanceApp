import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { savings } from "@finance/contracts";
import { subtractMoney } from "@finance/money";

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
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import {
  SAVINGS_ENTRY_REPOSITORY,
  type SavingsEntryRepositoryPort,
} from "../../../savings-entry/domain/ports/savings-entry.repository.port";
import { SavingsGoalNotFoundError } from "../../domain/errors";
import {
  SAVINGS_GOAL_REPOSITORY,
  type SavingsGoalRepositoryPort,
} from "../../domain/ports/savings-goal.repository.port";
import { toSavingsGoalContract } from "../savings-goal-dto.mapper";
import { ReopenSavingsGoalCommand } from "./reopen-savings-goal.command";

/**
 * Reverts a closed goal back to open. Only a `WITHDRAW_TO_ACCOUNT` close left
 * anything to reverse (`SavingsGoal.reopen()` returns `null` for the other two
 * destinations, per spec Assumptions — the entry reassignment they did is NOT
 * undone). When it does, the withdrawal's `Transaction` is deleted and the
 * account's balance moved back down by the same amount — same shape as
 * `undo-debt-payment.handler.ts`, including reading the goal `FOR UPDATE`
 * inside the same transaction that mutates and saves it.
 */
@Injectable()
@CommandHandler(ReopenSavingsGoalCommand)
export class ReopenSavingsGoalHandler extends BaseIdempotentCommandHandler<
  ReopenSavingsGoalCommand,
  savings.SavingsGoal,
  null
> {
  protected readonly operation = "savingsGoal.reopen";
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

  protected requestBody(command: ReopenSavingsGoalCommand): unknown {
    return { id: command.id };
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handleIdempotent(
    command: ReopenSavingsGoalCommand,
    _context: null,
    complete: CompleteFn<savings.SavingsGoal>,
  ): Promise<HandleResult<savings.SavingsGoal>> {
    const result = await this.prisma.$transaction(async (tx) => {
      const goal = await this.repo.findOneForUpdateWithTx(tx, command.userId, command.id);
      if (!goal) throw new SavingsGoalNotFoundError();
      const reversed = goal.reopen();
      if (reversed) {
        await this.transactions.deleteWithTx(tx, reversed.transactionId);
        // The withdrawal was an INCOME (money came in) — reversing it takes
        // that back out.
        await this.accounts.incrementBalanceWithTx(
          tx,
          reversed.accountId,
          subtractMoney("0", reversed.amount),
        );
      }
      await this.repo.saveWithTx(tx, goal);
      const contract = await toSavingsGoalContract(this.entries, command.userId, goal);
      await complete(tx, contract);
      return contract;
    });
    return { result, events: [] };
  }
}
