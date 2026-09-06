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
    @Inject(BANK_ACCOUNT_LOOKUP) private readonly accounts: BankAccountLookupPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateRecurringExpenseCommand): Promise<RecurringExpense> {
    const expense = await this.repo.findOne(command.userId, command.id);
    if (!expense) throw new RecurringExpenseNotFoundError();
    if (
      command.input.bankAccountId &&
      !(await this.accounts.accountOwned(command.userId, command.input.bankAccountId))
    ) {
      throw new AccountNotFoundError();
    }
    if (
      command.input.cardId &&
      !(await this.cards.existsForUser(command.userId, command.input.cardId))
    ) {
      throw new CardNotFoundError();
    }
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
      ...(input.cardId !== undefined ? { cardId: input.cardId } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    return { result: expense.toContract(startOfTodayUTC(new Date())), events: [] };
  }

  protected override async persist(expense: RecurringExpense): Promise<void> {
    await this.repo.save(expense);
  }
}
