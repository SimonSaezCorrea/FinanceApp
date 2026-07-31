import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { installments } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../domain/ports/installment-plan.repository.port";
import { ListInstallmentPlansQuery } from "./list-installment-plans.query";

@Injectable()
@QueryHandler(ListInstallmentPlansQuery)
export class ListInstallmentPlansQueryHandler extends BaseQueryHandler<
  ListInstallmentPlansQuery,
  installments.InstallmentPlan[],
  string
> {
  constructor(
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly repo: InstallmentPlanRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(query: ListInstallmentPlansQuery): Promise<string> {
    return query.userId;
  }

  protected async handle(
    _query: ListInstallmentPlansQuery,
    userId: string,
  ): Promise<installments.InstallmentPlan[]> {
    const rows = await this.repo.list(userId);
    return rows.map((r) => r.toContract());
  }
}
