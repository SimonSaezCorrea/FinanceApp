import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { recurring } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { startOfTodayUTC } from "../../domain/recurring-expense.aggregate";
import {
  RECURRING_EXPENSE_REPOSITORY,
  type RecurringExpenseRepositoryPort,
} from "../../domain/ports/recurring-expense.repository.port";
import { ListRecurringExpensesQuery } from "./list-recurring-expenses.query";

@Injectable()
@QueryHandler(ListRecurringExpensesQuery)
export class ListRecurringExpensesQueryHandler extends BaseQueryHandler<
  ListRecurringExpensesQuery,
  recurring.RecurringExpense[],
  string
> {
  constructor(@Inject(RECURRING_EXPENSE_REPOSITORY) private readonly repo: RecurringExpenseRepositoryPort) {
    super();
  }

  protected async loadContext(query: ListRecurringExpensesQuery): Promise<string> {
    return query.userId;
  }

  protected async handle(_query: ListRecurringExpensesQuery, userId: string): Promise<recurring.RecurringExpense[]> {
    const rows = await this.repo.list(userId);
    const today = startOfTodayUTC(new Date());
    return rows.map((r) => r.toContract(today));
  }
}
