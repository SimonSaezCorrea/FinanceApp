import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { recurring } from "@finance/contracts";

import {
  BANK_ACCOUNT_LOOKUP,
  type BankAccountLookupPort,
} from "../../../bank-account/domain/ports/bank-account-lookup.port";
import { AccountNotFoundError, CardNotFoundError } from "../../../bank-account/domain/errors";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
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
    @Inject(BANK_ACCOUNT_LOOKUP) private readonly accounts: BankAccountLookupPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: CreateRecurringExpenseCommand): Promise<Context> {
    const { input } = command;
    if (
      input.bankAccountId &&
      !(await this.accounts.accountOwned(command.userId, input.bankAccountId))
    ) {
      throw new AccountNotFoundError();
    }
    if (input.cardId && !(await this.cards.existsForUser(command.userId, input.cardId))) {
      throw new CardNotFoundError();
    }
    const plan = RecurringExpense.planCreation({
      label: input.label,
      amount: input.amount,
      currency: input.currency,
      category: input.category,
      frequency: input.frequency,
      interval: input.interval,
      anchorDate: new Date(input.anchorDate),
      bankAccountId: input.bankAccountId,
      cardId: input.cardId,
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
