import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { savings } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  SAVINGS_ENTRY_REPOSITORY,
  type SavingsEntryRepositoryPort,
} from "../../../savings-entry/domain/ports/savings-entry.repository.port";
import {
  SAVINGS_GOAL_REPOSITORY,
  type SavingsGoalRepositoryPort,
} from "../../domain/ports/savings-goal.repository.port";
import { toSavingsGoalContracts } from "../savings-goal-dto.mapper";
import { ListSavingsGoalsQuery } from "./list-savings-goals.query";

@Injectable()
@QueryHandler(ListSavingsGoalsQuery)
export class ListSavingsGoalsQueryHandler extends BaseQueryHandler<
  ListSavingsGoalsQuery,
  savings.SavingsGoal[],
  string
> {
  constructor(
    @Inject(SAVINGS_GOAL_REPOSITORY) private readonly repo: SavingsGoalRepositoryPort,
    @Inject(SAVINGS_ENTRY_REPOSITORY) private readonly entries: SavingsEntryRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(query: ListSavingsGoalsQuery): Promise<string> {
    return query.userId;
  }

  protected async handle(
    _query: ListSavingsGoalsQuery,
    userId: string,
  ): Promise<savings.SavingsGoal[]> {
    const rows = await this.repo.list(userId);
    return toSavingsGoalContracts(this.entries, userId, rows);
  }
}
