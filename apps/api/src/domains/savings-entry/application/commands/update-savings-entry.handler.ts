import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { savings } from "@finance/contracts";
import { subtractMoney } from "@finance/money";

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
import { SavingsGoalNotFoundError } from "../../../savings-goal/domain/errors";
import {
  SAVINGS_GOAL_REPOSITORY,
  type SavingsGoalRepositoryPort,
} from "../../../savings-goal/domain/ports/savings-goal.repository.port";
import {
  SavingsEntryCurrencyMismatchError,
  SavingsEntryFromCreditAccountError,
  SavingsEntryGoalClosedError,
  SavingsEntryNotFoundError,
  SavingsEntryTitleRequiredError,
} from "../../domain/errors";
import { SavingsEntry } from "../../domain/savings-entry.aggregate";
import {
  SAVINGS_ENTRY_REPOSITORY,
  type SavingsEntryRepositoryPort,
} from "../../domain/ports/savings-entry.repository.port";
import { UpdateSavingsEntryCommand } from "./update-savings-entry.command";

interface Context {
  entry: SavingsEntry;
  /** The goal title to describe the (possibly re-created) transaction with —
   * resolved from the patch's `savingsGoalId` when present, otherwise the
   * entry's own current goal. `null` = ahorro libre. */
  effectiveGoalTitle: string | null;
}

const MONEY_FIELDS = ["amount", "currency", "bankAccountId", "contributedAt"] as const;

/**
 * Corrects a contribution — retry-safe (Principle VII), and now reverses the
 * money it already moved before applying the new value whenever the patch
 * touches `amount`/`currency`/`bankAccountId`/`contributedAt` (same
 * reverse-then-reapply shape a `Transaction` move already uses elsewhere).
 * Blocked entirely (`SAVINGS_GOAL_CLOSED`) while the entry's own goal is
 * closed — reopen it first.
 */
@Injectable()
@CommandHandler(UpdateSavingsEntryCommand)
export class UpdateSavingsEntryHandler extends BaseIdempotentCommandHandler<
  UpdateSavingsEntryCommand,
  savings.SavingsEntry,
  Context
> {
  protected readonly operation = "savingsEntry.update";
  protected override readonly successStatus = 200;

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

  protected requestBody(command: UpdateSavingsEntryCommand): unknown {
    return { id: command.id, ...command.input };
  }

  protected async loadContext(command: UpdateSavingsEntryCommand): Promise<Context> {
    const entry = await this.repo.findOne(command.userId, command.id);
    if (!entry) throw new SavingsEntryNotFoundError();

    const currentGoalId = entry.savingsGoalId;
    let effectiveGoalTitle: string | null = null;
    if (currentGoalId !== null) {
      const currentGoal = await this.goals.findOne(command.userId, currentGoalId);
      if (currentGoal?.snapshot().closedAt !== null) throw new SavingsEntryGoalClosedError();
      effectiveGoalTitle = currentGoal?.snapshot().title ?? null;
    }

    const { input } = command;
    if (input.savingsGoalId !== undefined) {
      if (input.savingsGoalId === null) {
        effectiveGoalTitle = null;
      } else {
        const goal = await this.goals.findOne(command.userId, input.savingsGoalId);
        if (!goal) throw new SavingsGoalNotFoundError();
        const goalSnap = goal.snapshot();
        if (goalSnap.closedAt !== null) throw new SavingsEntryGoalClosedError();
        if (goalSnap.currency !== (input.currency ?? entry.currency)) {
          throw new SavingsEntryCurrencyMismatchError();
        }
        effectiveGoalTitle = goalSnap.title;
      }
    }

    if (effectiveGoalTitle === null) {
      const effectiveTitle = input.title !== undefined ? input.title : entry.snapshot().title;
      if (!effectiveTitle?.trim()) throw new SavingsEntryTitleRequiredError();
    }

    return { entry, effectiveGoalTitle };
  }

  protected async handleIdempotent(
    command: UpdateSavingsEntryCommand,
    context: Context,
    complete: CompleteFn<savings.SavingsEntry>,
  ): Promise<HandleResult<savings.SavingsEntry>> {
    const { input, userId } = command;
    const { entry } = context;
    const touchesMoney = MONEY_FIELDS.some((f) => input[f] !== undefined);

    const result = await this.prisma.$transaction(async (tx) => {
      let newTransactionId = entry.transactionId;

      if (touchesMoney) {
        const newAccountId = input.bankAccountId ?? entry.bankAccountId;
        const newAmount = input.amount ?? entry.amount;
        const newCurrency = input.currency ?? entry.currency;
        if (!newAccountId) throw new AccountNotFoundError();

        const newAccount = await this.accounts.findById(userId, newAccountId);
        if (!newAccount) throw new AccountNotFoundError();
        const newAccountSnap = newAccount.snapshot();
        if (newAccountSnap.type === "CREDIT_CARD") throw new SavingsEntryFromCreditAccountError();
        if (newAccountSnap.currency !== newCurrency) throw new SavingsEntryCurrencyMismatchError();

        // Reverse the old movement first — old account, opposite delta.
        if (entry.transactionId && entry.bankAccountId) {
          await this.transactions.deleteWithTx(tx, entry.transactionId);
          await this.accounts.incrementBalanceWithTx(tx, entry.bankAccountId, entry.amount);
        }

        MovementPolicy.assertWithinPrepaidBalance(
          { type: "EXPENSE", amount: newAmount },
          newAccountSnap,
        );
        MovementPolicy.assertWithinOverdraft(
          { type: "EXPENSE", amount: newAmount },
          newAccountSnap,
        );

        newTransactionId = generateRowId();
        await this.transactions.createWithTx(tx, {
          id: newTransactionId,
          userId,
          bankAccountId: newAccountId,
          type: "EXPENSE",
          amount: newAmount,
          currency: newCurrency,
          occurredAt: input.contributedAt
            ? new Date(input.contributedAt)
            : entry.snapshot().contributedAt,
          category: "Ahorro",
          description:
            (input.title !== undefined ? input.title : entry.snapshot().title)?.trim() ||
            (context.effectiveGoalTitle
              ? `Aporte a «${context.effectiveGoalTitle}»`
              : "Aporte a ahorro libre"),
          observation: (input.note !== undefined ? input.note : entry.snapshot().note) ?? null,
          savingsEntryId: entry.id,
        });
        await this.accounts.incrementBalanceWithTx(tx, newAccountId, subtractMoney("0", newAmount));
      }

      entry.applyUpdate({
        ...(input.savingsGoalId !== undefined ? { savingsGoalId: input.savingsGoalId } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.contributedAt !== undefined
          ? { contributedAt: new Date(input.contributedAt) }
          : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.bankAccountId !== undefined ? { bankAccountId: input.bankAccountId } : {}),
        ...(touchesMoney ? { transactionId: newTransactionId } : {}),
      });

      const contract = entry.toContract();
      await this.repo.saveWithTx(tx, entry);
      await complete(tx, contract);
      return contract;
    });
    return { result, events: [] };
  }
}
