import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { CardAccountDataModule } from "../card-account/card-account.data.module";
import { CreditStatementDataModule } from "../credit-statement/credit-statement.data.module";
import { DebtDataModule } from "../debt/debt.data.module";
import { InstallmentPlanDataModule } from "../installment-plan/installment-plan.data.module";
import { RecurringExpenseDataModule } from "../recurring-expense/recurring-expense.data.module";
import { SavingsEntryDataModule } from "../savings-entry/savings-entry.data.module";
import { TransactionDataModule } from "../transaction/transaction.data.module";
import { BankAccountDataModule } from "./bank-account.data.module";
import { AddCardHandler } from "./application/commands/add-card.handler";
import { CreateAccountHandler } from "./application/commands/create-account.handler";
import { RemoveAccountHandler } from "./application/commands/remove-account.handler";
import { RemoveCardHandler } from "./application/commands/remove-card.handler";
import { SetAccountStatusHandler } from "./application/commands/set-account-status.handler";
import { UpdateAccountHandler } from "./application/commands/update-account.handler";
import { UpdateCardHandler } from "./application/commands/update-card.handler";
import { AccountDeletionScopeLoader } from "./application/account-deletion.loader";
import { GetAccountDeletionImpactQueryHandler } from "./application/queries/get-account-deletion-impact.handler";
import { GetAccountQueryHandler } from "./application/queries/get-account.handler";
import { ListAccountsQueryHandler } from "./application/queries/list-accounts.handler";
import { AccountsController } from "./presentation/accounts.controller";

const commandHandlers = [
  CreateAccountHandler,
  UpdateAccountHandler,
  SetAccountStatusHandler,
  RemoveAccountHandler,
  AddCardHandler,
  UpdateCardHandler,
  RemoveCardHandler,
];

const queryHandlers = [
  ListAccountsQueryHandler,
  GetAccountQueryHandler,
  GetAccountDeletionImpactQueryHandler,
];

/**
 * Orchestration module for the `bank-account` table: its commands, queries and
 * the `/accounts` + `/accounts/:id/cards` routes. Billing periods live in
 * `domains/credit-statement` (its own table, its own module and controller).
 */
@Module({
  imports: [
    CqrsModule,
    JwtModule.register({}),
    BankAccountDataModule,
    TransactionDataModule,
    CardAccountDataModule,
    InstallmentPlanDataModule,
    CreditStatementDataModule,
    RecurringExpenseDataModule,
    SavingsEntryDataModule,
    DebtDataModule,
  ],
  controllers: [AccountsController],
  providers: [...commandHandlers, ...queryHandlers, AccountDeletionScopeLoader, JwtAuthGuard],
})
export class BankAccountModule {}
