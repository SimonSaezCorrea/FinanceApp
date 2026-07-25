import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { installments } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { InstallmentPlanNotFoundError } from "../../domain/errors";
import type { InstallmentPlan } from "../../domain/installment-plan.aggregate";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../domain/ports/installment-plan.repository.port";
import { GetInstallmentPlanQuery } from "./get-installment-plan.query";

@Injectable()
@QueryHandler(GetInstallmentPlanQuery)
export class GetInstallmentPlanQueryHandler extends BaseQueryHandler<
  GetInstallmentPlanQuery,
  installments.InstallmentPlan,
  InstallmentPlan
> {
  constructor(@Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly repo: InstallmentPlanRepositoryPort) {
    super();
  }

  protected async loadContext(query: GetInstallmentPlanQuery): Promise<InstallmentPlan> {
    const row = await this.repo.findOne(query.userId, query.id);
    if (!row) throw new InstallmentPlanNotFoundError();
    return row;
  }

  protected async handle(_query: GetInstallmentPlanQuery, row: InstallmentPlan): Promise<installments.InstallmentPlan> {
    return row.toContract();
  }
}
