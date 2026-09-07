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
import { SavingsGoalNotFoundError } from "../../../savings-goal/domain/errors";
import {
  SAVINGS_GOAL_REPOSITORY,
  type SavingsGoalRepositoryPort,
} from "../../../savings-goal/domain/ports/savings-goal.repository.port";
import {
  SavingsEntryCurrencyMismatchError,
  SavingsEntryFromCreditAccountError,
  SavingsEntryGoalClosedError,
  SavingsEntryTitleRequiredError,
} from "../../domain/errors";
import { SavingsEntry, type PlannedSavingsEntry } from "../../domain/savings-entry.aggregate";
import {
  SAVINGS_ENTRY_REPOSITORY,
  type SavingsEntryRepositoryPort,
} from "../../domain/ports/savings-entry.repository.port";
import { CreateSavingsEntryCommand } from "./create-savings-entry.command";

interface Context {
  account: BankAccount;
  goalTitle: string | null;
}

/**
 * Registers a real aporte — retry-safe (Constitution Principle VII form (c)):
 * an EXPENSE on the source account, exactly the debt/instalment payment
 * skeleton (`register-debt-payment.handler.ts`). Verifies `bankAccountId`
 * (new FK from the client's body — Principle II) and `savingsGoalId` (already
 * verified before this feature; now also checked for currency and closed
 * state) before persisting either.
 */
@Injectable()
@CommandHandler(CreateSavingsEntryCommand)
export class CreateSavingsEntryHandler extends BaseIdempotentCommandHandler<
  CreateSavingsEntryCommand,
  savings.SavingsEntry,
  Context
> {
  protected readonly operation = "savingsEntry.create";
  protected override readonly successStatus = 201;

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

  protected requestBody(command: CreateSavingsEntryCommand): unknown {
    return command.input;
  }

  protected async loadContext(command: CreateSavingsEntryCommand): Promise<Context> {
    const { input } = command;

    const account = await this.accounts.findById(command.userId, input.bankAccountId);
    if (!account) throw new AccountNotFoundError();
    const accountSnap = account.snapshot();
    if (accountSnap.type === "CREDIT_CARD") throw new SavingsEntryFromCreditAccountError();
    if (accountSnap.currency !== input.currency) throw new SavingsEntryCurrencyMismatchError();

    let goalTitle: string | null = null;
    if (input.savingsGoalId !== undefined) {
      const goal = await this.goals.findOne(command.userId, input.savingsGoalId);
      if (!goal) throw new SavingsGoalNotFoundError();
      const goalSnap = goal.snapshot();
      if (goalSnap.currency !== input.currency) throw new SavingsEntryCurrencyMismatchError();
      if (goalSnap.closedAt !== null) throw new SavingsEntryGoalClosedError();
      goalTitle = goalSnap.title;
    } else if (!input.title?.trim()) {
      // Ahorro libre has no goal to name it by — the UI already requires
      // this, but the server is the actual authority.
      throw new SavingsEntryTitleRequiredError();
    }

    return { account, goalTitle };
  }

  protected async handleIdempotent(
    command: CreateSavingsEntryCommand,
    context: Context,
    complete: CompleteFn<savings.SavingsEntry>,
  ): Promise<HandleResult<savings.SavingsEntry>> {
    const { input, userId } = command;
    const account = context.account.snapshot();

    const result = await this.prisma.$transaction(async (tx) => {
      MovementPolicy.assertWithinPrepaidBalance({ type: "EXPENSE", amount: input.amount }, account);
      MovementPolicy.assertWithinOverdraft({ type: "EXPENSE", amount: input.amount }, account);

      const transactionId = generateRowId();
      const plan: PlannedSavingsEntry = SavingsEntry.planCreation({
        savingsGoalId: input.savingsGoalId,
        amount: input.amount,
        currency: input.currency,
        contributedAt: new Date(input.contributedAt),
        title: input.title,
        note: input.note,
        bankAccountId: account.id,
        transactionId,
      });
      const entry = await this.repo.createWithTx(tx, userId, plan);

      await this.transactions.createWithTx(tx, {
        id: transactionId,
        userId,
        bankAccountId: account.id,
        type: "EXPENSE",
        amount: input.amount,
        currency: account.currency,
        occurredAt: plan.contributedAt,
        category: "Ahorro",
        description:
          input.title?.trim() ||
          (context.goalTitle ? `Aporte a «${context.goalTitle}»` : "Aporte a ahorro libre"),
        observation: input.note ?? null,
        savingsEntryId: entry.id,
      });
      await this.accounts.incrementBalanceWithTx(tx, account.id, subtractMoney("0", input.amount));

      const contract = entry.toContract();
      await complete(tx, contract);
      return contract;
    });
    return { result, events: [] };
  }
}
