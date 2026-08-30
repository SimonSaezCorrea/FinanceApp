import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../../installment-plan/domain/ports/installment-plan.repository.port";
import {
  TRANSACTION_SUMS_REPOSITORY,
  type TransactionSumsRepositoryPort,
} from "../../../transaction/domain/ports/transaction-sums.repository.port";
import type { BankAccount } from "../../domain/bank-account.aggregate";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../domain/ports/bank-account.repository.port";
import { accountsToDtos } from "./account-dto.mapper";
import { ListAccountsQuery } from "./list-accounts.query";

@Injectable()
@QueryHandler(ListAccountsQuery)
export class ListAccountsQueryHandler extends BaseQueryHandler<
  ListAccountsQuery,
  accounts.BankAccount[],
  BankAccount[]
> {
  constructor(
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(TRANSACTION_SUMS_REPOSITORY) private readonly sumsRepo: TransactionSumsRepositoryPort,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly plansRepo: InstallmentPlanRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(query: ListAccountsQuery): Promise<BankAccount[]> {
    const where = query.filters.status
      ? {
          status: (query.filters.status === "active"
            ? "ACTIVE"
            : "INACTIVE") as accounts.AccountStatus,
        }
      : {};
    return this.accountRepo.listByUser(query.userId, where);
  }

  protected async handle(
    query: ListAccountsQuery,
    rows: BankAccount[],
  ): Promise<accounts.BankAccount[]> {
    return accountsToDtos(this.sumsRepo, query.userId, rows, this.plansRepo);
  }
}
