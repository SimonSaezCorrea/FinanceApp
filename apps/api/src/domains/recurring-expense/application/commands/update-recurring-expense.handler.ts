import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { recurring } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { RecurringExpenseNotFoundError } from "../../domain/errors";
import { startOfTodayUTC, type RecurringExpense } from "../../domain/recurring-expense.aggregate";
import {
  RECURRING_EXPENSE_REPOSITORY,
  type RecurringExpenseRepositoryPort,
} from "../../domain/ports/recurring-expense.repository.port";
import { UpdateRecurringExpenseCommand } from "./update-recurring-expense.command";

@Injectable()
@CommandHandler(UpdateRecurringExpenseCommand)
export class UpdateRecurringExpenseHandler extends BaseCommandHandler<
  UpdateRecurringExpenseCommand,
  recurring.RecurringExpense,
  RecurringExpense
> {
  constructor(
    eventBus: EventBus,
    @Inject(RECURRING_EXPENSE_REPOSITORY) private readonly repo: RecurringExpenseRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateRecurringExpenseCommand): Promise<RecurringExpense> {
    const expense = await this.repo.findOne(command.userId, command.id);
    if (!expense) throw new RecurringExpenseNotFoundError();
    return expense;
  }

  protected async handle(
    command: UpdateRecurringExpenseCommand,
    expense: RecurringExpense,
  ): Promise<HandleResult<recurring.RecurringExpense>> {
    const { input } = command;
    expense.applyUpdate({
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.interval !== undefined ? { interval: input.interval } : {}),
      ...(input.anchorDate !== undefined ? { anchorDate: new Date(input.anchorDate) } : {}),
      ...(input.bankAccountId !== undefined ? { bankAccountId: input.bankAccountId } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    return { result: expense.toContract(startOfTodayUTC(new Date())), events: [] };
  }

  protected override async persist(expense: RecurringExpense): Promise<void> {
    await this.repo.save(expense);
  }
}
