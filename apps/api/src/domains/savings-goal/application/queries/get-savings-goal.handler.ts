import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { savings } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { SavingsGoalNotFoundError } from "../../domain/errors";
import type { SavingsGoal } from "../../domain/savings-goal.aggregate";
import {
  SAVINGS_GOAL_REPOSITORY,
  type SavingsGoalRepositoryPort,
} from "../../domain/ports/savings-goal.repository.port";
import { GetSavingsGoalQuery } from "./get-savings-goal.query";

@Injectable()
@QueryHandler(GetSavingsGoalQuery)
export class GetSavingsGoalQueryHandler extends BaseQueryHandler<
  GetSavingsGoalQuery,
  savings.SavingsGoal,
  SavingsGoal
> {
  constructor(@Inject(SAVINGS_GOAL_REPOSITORY) private readonly repo: SavingsGoalRepositoryPort) {
    super();
  }

  protected async loadContext(query: GetSavingsGoalQuery): Promise<SavingsGoal> {
    const row = await this.repo.findOne(query.userId, query.id);
    if (!row) throw new SavingsGoalNotFoundError();
    return row;
  }

  protected async handle(
    _query: GetSavingsGoalQuery,
    row: SavingsGoal,
  ): Promise<savings.SavingsGoal> {
    return row.toContract();
  }
}
