import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { recurring } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { RecurringExpenseNotFoundError } from "../../domain/errors";
import { startOfTodayUTC, type RecurringExpense } from "../../domain/recurring-expense.aggregate";
import {
  RECURRING_EXPENSE_REPOSITORY,
  type RecurringExpenseRepositoryPort,
} from "../../domain/ports/recurring-expense.repository.port";
import { GetRecurringExpenseQuery } from "./get-recurring-expense.query";

@Injectable()
@QueryHandler(GetRecurringExpenseQuery)
export class GetRecurringExpenseQueryHandler extends BaseQueryHandler<
  GetRecurringExpenseQuery,
  recurring.RecurringExpense,
  RecurringExpense
> {
  constructor(
    @Inject(RECURRING_EXPENSE_REPOSITORY) private readonly repo: RecurringExpenseRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(query: GetRecurringExpenseQuery): Promise<RecurringExpense> {
    const row = await this.repo.findOne(query.userId, query.id);
    if (!row) throw new RecurringExpenseNotFoundError();
    return row;
  }

  protected async handle(
    _query: GetRecurringExpenseQuery,
    row: RecurringExpense,
  ): Promise<recurring.RecurringExpense> {
    return row.toContract(startOfTodayUTC(new Date()));
  }
}
