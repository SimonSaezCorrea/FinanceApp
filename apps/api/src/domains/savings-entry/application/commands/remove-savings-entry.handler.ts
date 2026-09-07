import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

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
  SAVINGS_GOAL_REPOSITORY,
  type SavingsGoalRepositoryPort,
} from "../../../savings-goal/domain/ports/savings-goal.repository.port";
import { SavingsEntryGoalClosedError, SavingsEntryNotFoundError } from "../../domain/errors";
import type { SavingsEntry } from "../../domain/savings-entry.aggregate";
import {
  SAVINGS_ENTRY_REPOSITORY,
  type SavingsEntryRepositoryPort,
} from "../../domain/ports/savings-entry.repository.port";
import { RemoveSavingsEntryCommand } from "./remove-savings-entry.command";

interface Context {
  entry: SavingsEntry;
}

/** Deletes a contribution and reverses the real money it moved — the source
 * account's balance goes back up by exactly what the aporte took out, and its
 * `Transaction` is deleted. Blocked (`SAVINGS_GOAL_CLOSED`) while the entry's
 * own goal is closed. No compensating entry, no synthetic reversal beyond
 * that: this domain has no external ledger to reconcile against. */
@Injectable()
@CommandHandler(RemoveSavingsEntryCommand)
export class RemoveSavingsEntryHandler extends BaseIdempotentCommandHandler<
  RemoveSavingsEntryCommand,
  void,
  Context
> {
  protected readonly operation = "savingsEntry.remove";
  protected override readonly successStatus = 204;

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    @Inject(SAVINGS_ENTRY_REPOSITORY) private readonly repo: SavingsEntryRepositoryPort,
    @Inject(SAVINGS_GOAL_REPOSITORY) private readonly goals: SavingsGoalRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: RemoveSavingsEntryCommand): unknown {
    return { id: command.id };
  }

  protected async loadContext(command: RemoveSavingsEntryCommand): Promise<Context> {
    const entry = await this.repo.findOne(command.userId, command.id);
    if (!entry) throw new SavingsEntryNotFoundError();
    if (entry.savingsGoalId !== null) {
      const goal = await this.goals.findOne(command.userId, entry.savingsGoalId);
      if (goal?.snapshot().closedAt !== null) throw new SavingsEntryGoalClosedError();
    }
    return { entry };
  }

  protected async handleIdempotent(
    command: RemoveSavingsEntryCommand,
    { entry }: Context,
    complete: CompleteFn<void>,
  ): Promise<HandleResult<void>> {
    await this.prisma.$transaction(async (tx) => {
      if (entry.transactionId && entry.bankAccountId) {
        await this.transactions.deleteWithTx(tx, entry.transactionId);
        await this.accounts.incrementBalanceWithTx(tx, entry.bankAccountId, entry.amount);
      }
      const ok = await this.repo.removeWithTx(tx, command.userId, command.id);
      if (!ok) throw new SavingsEntryNotFoundError();
      await complete(tx, undefined);
    });
    return { result: undefined, events: [] };
  }
}
