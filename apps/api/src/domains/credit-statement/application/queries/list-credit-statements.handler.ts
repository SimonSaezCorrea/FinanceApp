import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { AccountNotFoundError } from "../../../bank-account/domain/errors";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../domain/ports/credit-statement.repository.port";
import { toStatementDto } from "../statement-dto.mapper";
import { ListCreditStatementsQuery } from "./list-credit-statements.query";

@Injectable()
@QueryHandler(ListCreditStatementsQuery)
export class ListCreditStatementsQueryHandler extends BaseQueryHandler<
  ListCreditStatementsQuery,
  accounts.CreditStatement[]
> {
  constructor(
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY)
    private readonly statementRepo: CreditStatementRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(query: ListCreditStatementsQuery): Promise<void> {
    const account = await this.accountRepo.findById(query.userId, query.accountId);
    if (!account) throw new AccountNotFoundError();
  }

  protected async handle(query: ListCreditStatementsQuery): Promise<accounts.CreditStatement[]> {
    const account = await this.accountRepo.findById(query.userId, query.accountId);
    const minimumPercent = account?.minimumPaymentPercent ?? null;
    const statements = await this.statementRepo.listForAccount(query.userId, query.accountId);
    return Promise.all(
      statements.map(async (s) => {
        // Settled periods carry their frozen figure; the rest are still live sums
        // of their linked transactions.
        const [amount, breakdown] = await Promise.all([
          s.paidAt
            ? Promise.resolve(s.amount)
            : // Plus whatever the previous period left unpaid — it is owed here now.
              this.statementRepo.sumLinkedTransactions(s.id).then((sum) => s.totalFor(sum)),
          this.statementRepo.breakdown(s.id),
        ]);
        return toStatementDto(s, { amount, breakdown, minimumPercent });
      }),
    );
  }
}
