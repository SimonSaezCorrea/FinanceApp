import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { savings } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { SavingsGoal, type PlannedSavingsGoal } from "../../domain/savings-goal.aggregate";
import {
  SAVINGS_GOAL_REPOSITORY,
  type SavingsGoalRepositoryPort,
} from "../../domain/ports/savings-goal.repository.port";
import { CreateSavingsGoalCommand } from "./create-savings-goal.command";

interface Context {
  plan: PlannedSavingsGoal;
}

/**
 * Creates a savings goal — the actual repository write happens in
 * `handle()` (same convention `recurring`'s `CreateRecurringExpenseHandler`
 * uses), so `persist()` stays the default no-op.
 */
@Injectable()
@CommandHandler(CreateSavingsGoalCommand)
export class CreateSavingsGoalHandler extends BaseCommandHandler<
  CreateSavingsGoalCommand,
  savings.SavingsGoal,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(SAVINGS_GOAL_REPOSITORY) private readonly repo: SavingsGoalRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: CreateSavingsGoalCommand): Promise<Context> {
    const { input } = command;
    const plan = SavingsGoal.planCreation({
      title: input.title,
      targetAmount: input.targetAmount,
      currency: input.currency,
      deadline: input.deadline ? new Date(input.deadline) : undefined,
    });
    return { plan };
  }

  protected async handle(
    command: CreateSavingsGoalCommand,
    context: Context,
  ): Promise<HandleResult<savings.SavingsGoal>> {
    const goal = await this.repo.create(command.userId, context.plan);
    return { result: goal.toContract(), events: [] };
  }
}
