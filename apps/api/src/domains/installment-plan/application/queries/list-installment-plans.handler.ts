import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { installments } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import { toPlanDtos } from "../plan-dto.mapper";
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
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
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
    return toPlanDtos(rows, userId, this.cards, this.accounts);
  }
}
