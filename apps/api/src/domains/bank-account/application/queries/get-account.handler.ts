import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  CREDIT_STATEMENT_LOOKUP,
  type CreditStatementLookupPort,
} from "../../../credit-statement/domain/ports/credit-statement-lookup.port";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../../installment-plan/domain/ports/installment-plan.repository.port";
import {
  TRANSACTION_SUMS_REPOSITORY,
  type TransactionSumsRepositoryPort,
} from "../../../transaction/domain/ports/transaction-sums.repository.port";
import type { BankAccount } from "../../domain/bank-account.aggregate";
import { AccountNotFoundError } from "../../domain/errors";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../domain/ports/bank-account.repository.port";
import { accountsToDtos } from "./account-dto.mapper";
import { GetAccountQuery } from "./get-account.query";

@Injectable()
@QueryHandler(GetAccountQuery)
export class GetAccountQueryHandler extends BaseQueryHandler<
  GetAccountQuery,
  accounts.BankAccount,
  BankAccount
> {
  constructor(
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(TRANSACTION_SUMS_REPOSITORY) private readonly sumsRepo: TransactionSumsRepositoryPort,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly plansRepo: InstallmentPlanRepositoryPort,
    @Inject(CREDIT_STATEMENT_LOOKUP) private readonly statements: CreditStatementLookupPort,
  ) {
    super();
  }

  protected async loadContext(query: GetAccountQuery): Promise<BankAccount> {
    const account = await this.accountRepo.findById(query.userId, query.accountId);
    if (!account) throw new AccountNotFoundError();
    return account;
  }

  protected async handle(
    query: GetAccountQuery,
    account: BankAccount,
  ): Promise<accounts.BankAccount> {
    const [dto] = await accountsToDtos(
      this.sumsRepo,
      query.userId,
      [account],
      this.plansRepo,
      this.statements,
    );
    return dto;
  }
}
