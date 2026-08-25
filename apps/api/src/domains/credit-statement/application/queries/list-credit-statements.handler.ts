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
    const paymentDueDay = account?.paymentDueDay ?? null;
    const statements = await this.statementRepo.listForAccount(query.userId, query.accountId);
    return Promise.all(
      statements.map(async (s) => {
        // Settled periods carry their frozen figure; the rest are still live sums
        // of their linked transactions, plus what was carried in, plus what the
        // schedule billed (spec 014, FR-010) — the breakdown is fetched first
        // because an unsettled period's total is built FROM it, not alongside it.
        const breakdown = await this.statementRepo.breakdown(s.id);
        const amount = s.paidAt ? s.amount : s.totalFor(breakdown.purchases, breakdown.installments);
        return toStatementDto(s, { amount, breakdown, minimumPercent, paymentDueDay });
      }),
    );
  }
}
