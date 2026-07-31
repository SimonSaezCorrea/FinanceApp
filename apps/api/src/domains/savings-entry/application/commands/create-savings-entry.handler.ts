import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { savings } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { SavingsEntry, type PlannedSavingsEntry } from "../../domain/savings-entry.aggregate";
import {
  SAVINGS_ENTRY_REPOSITORY,
  type SavingsEntryRepositoryPort,
} from "../../domain/ports/savings-entry.repository.port";
import { CreateSavingsEntryCommand } from "./create-savings-entry.command";

interface Context {
  plan: PlannedSavingsEntry;
}

/** Creates a contribution entry — the repository write happens in `handle()`,
 * so `persist()` stays the default no-op. */
@Injectable()
@CommandHandler(CreateSavingsEntryCommand)
export class CreateSavingsEntryHandler extends BaseCommandHandler<
  CreateSavingsEntryCommand,
  savings.SavingsEntry,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(SAVINGS_ENTRY_REPOSITORY) private readonly repo: SavingsEntryRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: CreateSavingsEntryCommand): Promise<Context> {
    const { input } = command;
    const plan = SavingsEntry.planCreation({
      savingsGoalId: input.savingsGoalId,
      amount: input.amount,
      currency: input.currency,
      contributedAt: new Date(input.contributedAt),
      note: input.note,
    });
    return { plan };
  }

  protected async handle(
    command: CreateSavingsEntryCommand,
    context: Context,
  ): Promise<HandleResult<savings.SavingsEntry>> {
    const entry = await this.repo.create(command.userId, context.plan);
    return { result: entry.toContract(), events: [] };
  }
}
