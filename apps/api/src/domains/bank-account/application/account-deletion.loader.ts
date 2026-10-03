import { Inject, Injectable } from "@nestjs/common";

import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../credit-statement/domain/ports/credit-statement.repository.port";
import {
  DEBT_REPOSITORY,
  type DebtRepositoryPort,
} from "../../debt/domain/ports/debt.repository.port";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../installment-plan/domain/ports/installment-plan.repository.port";
import {
  RECURRING_EXPENSE_REPOSITORY,
  type RecurringExpenseRepositoryPort,
} from "../../recurring-expense/domain/ports/recurring-expense.repository.port";
import {
  SAVINGS_ENTRY_REPOSITORY,
  type SavingsEntryRepositoryPort,
} from "../../savings-entry/domain/ports/savings-entry.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../transaction/domain/ports/transaction-writer.repository.port";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../domain/ports/bank-account.repository.port";
import {
  loadAccountDeletionScope,
  type AccountDeletionPorts,
  type AccountDeletionScope,
} from "./account-deletion";

/** Wires the ports `loadAccountDeletionScope` reads — one provider shared by the
 * impact query and the delete command. */
@Injectable()
export class AccountDeletionScopeLoader {
  private readonly ports: AccountDeletionPorts;

  constructor(
    @Inject(BANK_ACCOUNT_REPOSITORY) accounts: BankAccountRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY) transactions: TransactionWriterRepositoryPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY) statements: CreditStatementRepositoryPort,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) plans: InstallmentPlanRepositoryPort,
    @Inject(RECURRING_EXPENSE_REPOSITORY) recurring: RecurringExpenseRepositoryPort,
    @Inject(SAVINGS_ENTRY_REPOSITORY) savings: SavingsEntryRepositoryPort,
    @Inject(DEBT_REPOSITORY) debts: DebtRepositoryPort,
  ) {
    this.ports = { accounts, transactions, statements, plans, recurring, savings, debts };
  }

  load(userId: string, accountId: string): Promise<AccountDeletionScope | null> {
    return loadAccountDeletionScope(userId, accountId, this.ports);
  }
}
