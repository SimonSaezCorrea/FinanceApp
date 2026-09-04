import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { savings } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { SavingsGoalNotFoundError } from "../../../savings-goal/domain/errors";
import {
  SAVINGS_GOAL_REPOSITORY,
  type SavingsGoalRepositoryPort,
} from "../../../savings-goal/domain/ports/savings-goal.repository.port";
import { SavingsEntryNotFoundError } from "../../domain/errors";
import type { SavingsEntry } from "../../domain/savings-entry.aggregate";
import {
  SAVINGS_ENTRY_REPOSITORY,
  type SavingsEntryRepositoryPort,
} from "../../domain/ports/savings-entry.repository.port";
import { UpdateSavingsEntryCommand } from "./update-savings-entry.command";

/**
 * Corrects a contribution recorded by mistake — the camino de corrección
 * spec 015/US3 exists for (this aggregate had no update path at all before
 * it).
 *
 * `savingsGoalId`, when present in the patch, is verified against the
 * CALLER's own goals before it is persisted — the same FK a foreign id would
 * otherwise slip through unverified (Constitution Principle II; this is one
 * of the six write paths the audit found doing exactly that, closed here).
 */
@Injectable()
@CommandHandler(UpdateSavingsEntryCommand)
export class UpdateSavingsEntryHandler extends BaseCommandHandler<
  UpdateSavingsEntryCommand,
  savings.SavingsEntry,
  SavingsEntry
> {
  constructor(
    eventBus: EventBus,
    @Inject(SAVINGS_ENTRY_REPOSITORY) private readonly repo: SavingsEntryRepositoryPort,
    @Inject(SAVINGS_GOAL_REPOSITORY) private readonly goals: SavingsGoalRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateSavingsEntryCommand): Promise<SavingsEntry> {
    const entry = await this.repo.findOne(command.userId, command.id);
    if (!entry) throw new SavingsEntryNotFoundError();

    if (command.input.savingsGoalId !== undefined) {
      const goal = await this.goals.findOne(command.userId, command.input.savingsGoalId);
      if (!goal) throw new SavingsGoalNotFoundError();
    }

    return entry;
  }

  protected async handle(
    command: UpdateSavingsEntryCommand,
    entry: SavingsEntry,
  ): Promise<HandleResult<savings.SavingsEntry>> {
    const { input } = command;
    entry.applyUpdate({
      ...(input.savingsGoalId !== undefined ? { savingsGoalId: input.savingsGoalId } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.contributedAt !== undefined
        ? { contributedAt: new Date(input.contributedAt) }
        : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    });
    return { result: entry.toContract(), events: [] };
  }

  protected override async persist(entry: SavingsEntry): Promise<void> {
    await this.repo.save(entry);
  }
}
