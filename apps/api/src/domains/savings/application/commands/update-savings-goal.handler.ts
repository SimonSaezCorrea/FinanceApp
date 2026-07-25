import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { savings } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { SavingsGoalNotFoundError } from "../../domain/errors";
import type { SavingsGoal } from "../../domain/savings-goal.aggregate";
import {
  SAVINGS_GOAL_REPOSITORY,
  type SavingsGoalRepositoryPort,
} from "../../domain/ports/savings-goal.repository.port";
import { UpdateSavingsGoalCommand } from "./update-savings-goal.command";

@Injectable()
@CommandHandler(UpdateSavingsGoalCommand)
export class UpdateSavingsGoalHandler extends BaseCommandHandler<
  UpdateSavingsGoalCommand,
  savings.SavingsGoal,
  SavingsGoal
> {
  constructor(
    eventBus: EventBus,
    @Inject(SAVINGS_GOAL_REPOSITORY) private readonly repo: SavingsGoalRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateSavingsGoalCommand): Promise<SavingsGoal> {
    const goal = await this.repo.findOne(command.userId, command.id);
    if (!goal) throw new SavingsGoalNotFoundError();
    return goal;
  }

  protected async handle(
    command: UpdateSavingsGoalCommand,
    goal: SavingsGoal,
  ): Promise<HandleResult<savings.SavingsGoal>> {
    const { input } = command;
    goal.applyUpdate({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.targetAmount !== undefined ? { targetAmount: input.targetAmount } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.deadline !== undefined ? { deadline: new Date(input.deadline) } : {}),
    });
    return { result: goal.toContract(), events: [] };
  }

  protected override async persist(goal: SavingsGoal): Promise<void> {
    await this.repo.save(goal);
  }
}
