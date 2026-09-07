import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { savings } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  SAVINGS_ENTRY_REPOSITORY,
  type SavingsEntryRepositoryPort,
} from "../../../savings-entry/domain/ports/savings-entry.repository.port";
import { SavingsGoalNotFoundError } from "../../domain/errors";
import type { SavingsGoal } from "../../domain/savings-goal.aggregate";
import {
  SAVINGS_GOAL_REPOSITORY,
  type SavingsGoalRepositoryPort,
} from "../../domain/ports/savings-goal.repository.port";
import { toSavingsGoalContract } from "../savings-goal-dto.mapper";
import { UpdateSavingsGoalCommand } from "./update-savings-goal.command";

interface Context {
  goal: SavingsGoal;
  hasEntries: boolean;
}

@Injectable()
@CommandHandler(UpdateSavingsGoalCommand)
export class UpdateSavingsGoalHandler extends BaseCommandHandler<
  UpdateSavingsGoalCommand,
  savings.SavingsGoal,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(SAVINGS_GOAL_REPOSITORY) private readonly repo: SavingsGoalRepositoryPort,
    @Inject(SAVINGS_ENTRY_REPOSITORY) private readonly entries: SavingsEntryRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateSavingsGoalCommand): Promise<Context> {
    const goal = await this.repo.findOne(command.userId, command.id);
    if (!goal) throw new SavingsGoalNotFoundError();
    const hasEntries = (await this.entries.countByGoal(command.userId, command.id)) > 0;
    return { goal, hasEntries };
  }

  protected async handle(
    command: UpdateSavingsGoalCommand,
    { goal, hasEntries }: Context,
  ): Promise<HandleResult<savings.SavingsGoal>> {
    const { input } = command;
    goal.applyUpdate(
      {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.targetAmount !== undefined ? { targetAmount: input.targetAmount } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.deadline !== undefined
          ? { deadline: input.deadline ? new Date(input.deadline) : null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        ...(input.color !== undefined ? { color: input.color ?? null } : {}),
      },
      hasEntries,
    );
    const result = await toSavingsGoalContract(this.entries, command.userId, goal);
    return { result, events: [] };
  }

  protected override async persist({ goal }: Context): Promise<void> {
    await this.repo.save(goal);
  }
}
