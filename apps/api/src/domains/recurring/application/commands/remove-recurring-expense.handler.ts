import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { RecurringExpenseNotFoundError } from "../../domain/errors";
import {
  RECURRING_EXPENSE_REPOSITORY,
  type RecurringExpenseRepositoryPort,
} from "../../domain/ports/recurring-expense.repository.port";
import { RemoveRecurringExpenseCommand } from "./remove-recurring-expense.command";

@Injectable()
@CommandHandler(RemoveRecurringExpenseCommand)
export class RemoveRecurringExpenseHandler extends BaseCommandHandler<
  RemoveRecurringExpenseCommand,
  void,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(RECURRING_EXPENSE_REPOSITORY) private readonly repo: RecurringExpenseRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: RemoveRecurringExpenseCommand): Promise<HandleResult<void>> {
    const ok = await this.repo.remove(command.userId, command.id);
    if (!ok) throw new RecurringExpenseNotFoundError();
    return { result: undefined, events: [] };
  }
}
