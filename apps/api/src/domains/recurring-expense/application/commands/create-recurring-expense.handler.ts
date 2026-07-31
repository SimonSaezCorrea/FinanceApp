import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { recurring } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  RecurringExpense,
  startOfTodayUTC,
  type PlannedRecurringExpense,
} from "../../domain/recurring-expense.aggregate";
import {
  RECURRING_EXPENSE_REPOSITORY,
  type RecurringExpenseRepositoryPort,
} from "../../domain/ports/recurring-expense.repository.port";
import { CreateRecurringExpenseCommand } from "./create-recurring-expense.command";

interface Context {
  plan: PlannedRecurringExpense;
}

/**
 * Creates a recurring expense — the actual repository write happens in
 * `handle()` (same convention `debts`' `CreateDebtHandler` uses), so
 * `persist()` stays the default no-op.
 */
@Injectable()
@CommandHandler(CreateRecurringExpenseCommand)
export class CreateRecurringExpenseHandler extends BaseCommandHandler<
  CreateRecurringExpenseCommand,
  recurring.RecurringExpense,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(RECURRING_EXPENSE_REPOSITORY) private readonly repo: RecurringExpenseRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: CreateRecurringExpenseCommand): Promise<Context> {
    const { input } = command;
    const plan = RecurringExpense.planCreation({
      label: input.label,
      amount: input.amount,
      currency: input.currency,
      category: input.category,
      frequency: input.frequency,
      interval: input.interval,
      anchorDate: new Date(input.anchorDate),
      bankAccountId: input.bankAccountId,
      active: input.active,
      notes: input.notes,
    });
    return { plan };
  }

  protected async handle(
    command: CreateRecurringExpenseCommand,
    context: Context,
  ): Promise<HandleResult<recurring.RecurringExpense>> {
    const expense = await this.repo.create(command.userId, context.plan);
    return { result: expense.toContract(startOfTodayUTC(new Date())), events: [] };
  }
}
