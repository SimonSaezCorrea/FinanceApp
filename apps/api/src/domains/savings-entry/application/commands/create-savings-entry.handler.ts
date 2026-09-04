import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { savings } from "@finance/contracts";

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
import { SavingsGoalNotFoundError } from "../../../savings-goal/domain/errors";
import {
  SAVINGS_GOAL_REPOSITORY,
  type SavingsGoalRepositoryPort,
} from "../../../savings-goal/domain/ports/savings-goal.repository.port";
import { SavingsEntry, type PlannedSavingsEntry } from "../../domain/savings-entry.aggregate";
import {
  SAVINGS_ENTRY_REPOSITORY,
  type SavingsEntryRepositoryPort,
} from "../../domain/ports/savings-entry.repository.port";
import { CreateSavingsEntryCommand } from "./create-savings-entry.command";

interface Context {
  plan: PlannedSavingsEntry;
}

/**
 * Creates a contribution entry — retry-safe (Constitution Principle VII form
 * (c)), and verifies `savingsGoalId` belongs to the caller BEFORE persisting
 * it (Principle II). Before this feature it accepted a foreign goal id
 * unverified — one of the six write paths the audit found doing that;
 * closed here alongside the correction path that touches the same field.
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
    private readonly prisma: PrismaService,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: CreateSavingsEntryCommand): unknown {
    return command.input;
  }

  protected async loadContext(command: CreateSavingsEntryCommand): Promise<Context> {
    const { input } = command;

    if (input.savingsGoalId !== undefined) {
      const goal = await this.goals.findOne(command.userId, input.savingsGoalId);
      if (!goal) throw new SavingsGoalNotFoundError();
    }

    const plan = SavingsEntry.planCreation({
      savingsGoalId: input.savingsGoalId,
      amount: input.amount,
      currency: input.currency,
      contributedAt: new Date(input.contributedAt),
      note: input.note,
    });
    return { plan };
  }

  protected async handleIdempotent(
    command: CreateSavingsEntryCommand,
    context: Context,
    complete: CompleteFn<savings.SavingsEntry>,
  ): Promise<HandleResult<savings.SavingsEntry>> {
    const result = await this.prisma.$transaction(async (tx) => {
      const entry = await this.repo.createWithTx(tx, command.userId, context.plan);
      const contract = entry.toContract();
      await complete(tx, contract);
      return contract;
    });
    return { result, events: [] };
  }
}
