import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { AccountNotFoundError } from "../../../bank-account/domain/errors";
import { BANK_ACCOUNT_REPOSITORY, type BankAccountRepositoryPort } from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../domain/ports/credit-statement.repository.port";
import { ListCreditStatementsQuery } from "./list-credit-statements.query";

@Injectable()
@QueryHandler(ListCreditStatementsQuery)
export class ListCreditStatementsQueryHandler extends BaseQueryHandler<
  ListCreditStatementsQuery,
  accounts.CreditStatement[]
> {
  constructor(
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY) private readonly statementRepo: CreditStatementRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(query: ListCreditStatementsQuery): Promise<void> {
    const account = await this.accountRepo.findById(query.userId, query.accountId);
    if (!account) throw new AccountNotFoundError();
  }

  protected async handle(query: ListCreditStatementsQuery): Promise<accounts.CreditStatement[]> {
    const statements = await this.statementRepo.listForAccount(query.userId, query.accountId);
    return Promise.all(
      statements.map(async (s) => ({
        id: s.id,
        accountId: s.accountId,
        status: s.state.name,
        periodStart: s.periodStart.toISOString(),
        closedAt: s.closedAt?.toISOString() ?? null,
        paidAt: s.paidAt?.toISOString() ?? null,
        amount: s.paidAt ? s.amount : await this.statementRepo.sumLinkedTransactions(s.id),
        paidFromAccountId: s.paidFromAccountId,
        paidTransactionId: s.paidTransactionId,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    );
  }
}
