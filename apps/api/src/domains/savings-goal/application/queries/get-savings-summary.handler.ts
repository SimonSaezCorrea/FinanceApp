import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { savings } from "@finance/contracts";
import { addMoney, toMoney } from "@finance/money";

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
import { GetSavingsSummaryQuery } from "./get-savings-summary.query";

/**
 * `GET /savings/summary` — aggregated across every OPEN goal (cumplida or
 * not) plus ahorro libre, EXCLUDING closed goals entirely (FR-014). `pace`
 * and `missing` further exclude cumplida goals, which need neither anymore
 * (README's `openGoals = live + late`, as opposed to `openAndDoneGoals` for
 * `totalSaved`). The per-goal `savedAmount`/`pace` figures this sums come
 * from `toSavingsGoalContracts` — the same computation `GET /savings/goals`
 * uses, so the two views can never disagree (mirrors
 * `GET /transactions/summary`'s role for movements).
 */
@Injectable()
@QueryHandler(GetSavingsSummaryQuery)
export class GetSavingsSummaryQueryHandler extends BaseQueryHandler<
  GetSavingsSummaryQuery,
  savings.SavingsSummary,
  string
> {
  constructor(
    @Inject(SAVINGS_GOAL_REPOSITORY) private readonly repo: SavingsGoalRepositoryPort,
    @Inject(SAVINGS_ENTRY_REPOSITORY) private readonly entries: SavingsEntryRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(query: GetSavingsSummaryQuery): Promise<string> {
    return query.userId;
  }

  protected async handle(
    _query: GetSavingsSummaryQuery,
    userId: string,
  ): Promise<savings.SavingsSummary> {
    const [goals, freeSavingsTotal] = await Promise.all([
      this.repo.list(userId),
      this.entries.freeSavingsTotal(userId),
    ]);
    const contracts = await toSavingsGoalContracts(this.entries, userId, goals);

    let totalSaved = freeSavingsTotal;
    let pace = "0";
    let missing = "0";
    for (const g of contracts) {
      if (g.closedAt !== null) continue;
      totalSaved = addMoney(totalSaved, g.savedAmount);
      const complete = toMoney(g.savedAmount).greaterThanOrEqualTo(toMoney(g.targetAmount));
      if (complete) continue;
      pace = addMoney(pace, g.pace);
      const left = toMoney(g.targetAmount).minus(toMoney(g.savedAmount));
      missing = addMoney(missing, left.greaterThan(0) ? left.toString() : "0");
    }

    return {
      totalSaved,
      freeSavingsTotal,
      pace,
      missing,
    };
  }
}
