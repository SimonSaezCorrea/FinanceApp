import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { installments } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import { loadPlanDeletionReversal } from "../plan-deletion.loader";
import { toPlanDtos, withDeletionImpact } from "../plan-dto.mapper";
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
  constructor(
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly repo: InstallmentPlanRepositoryPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(query: GetInstallmentPlanQuery): Promise<InstallmentPlan> {
    const row = await this.repo.findOne(query.userId, query.id);
    if (!row) throw new InstallmentPlanNotFoundError();
    return row;
  }

  protected async handle(
    query: GetInstallmentPlanQuery,
    row: InstallmentPlan,
  ): Promise<installments.InstallmentPlan> {
    const [dto] = await toPlanDtos([row], query.userId, this.cards);
    const reversal = await loadPlanDeletionReversal(
      query.userId,
      query.id,
      this.transactions,
      this.accounts,
    );
    return withDeletionImpact(dto!, reversal);
  }
}
