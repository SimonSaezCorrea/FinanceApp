import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { BankAccountModule } from "./domains/bank-account/bank-account.module";
import { CreditStatementModule } from "./domains/credit-statement/credit-statement.module";
import { UserModule } from "./domains/user/user.module";
import { DebtModule } from "./domains/debt/debt.module";
import { HealthModule } from "./domains/health/health.module";
import { ImportModule } from "./domains/import/import.module";
import { InstallmentPlanModule } from "./domains/installment-plan/installment-plan.module";
import { InvestmentModule } from "./domains/investment/investment.module";
import { RecurringExpenseModule } from "./domains/recurring-expense/recurring-expense.module";
import { CountryModule } from "./domains/country/country.module";
import { CurrencyModule } from "./domains/currency/currency.module";
import { FinancialInstitutionModule } from "./domains/financial-institution/financial-institution.module";
import { SavingsGoalModule } from "./domains/savings-goal/savings-goal.module";
import { TransactionModule } from "./domains/transaction/transaction.module";
import { TransactionAttachmentModule } from "./domains/transaction-attachment/transaction-attachment.module";
import { WalletItemDashboardModule } from "./domains/wallet-item-dashboard/wallet-item-dashboard.module";
import { HandlerLoggingInterceptor } from "./infra/cqrs/handler-logging.interceptor";
import { CronModule } from "./infra/cron/cron.module";
import { PrismaModule } from "./infra/prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    UserModule,
    BankAccountModule,
    CreditStatementModule,
    TransactionModule,
    TransactionAttachmentModule,
    InstallmentPlanModule,
    DebtModule,
    SavingsGoalModule,
    InvestmentModule,
    ImportModule,
    RecurringExpenseModule,
    WalletItemDashboardModule,
    CountryModule,
    CurrencyModule,
    FinancialInstitutionModule,
    CronModule,
  ],
  // Decorator (FR-013): logging/timing around every command/query dispatch,
  // applied once here instead of inside any handler.
  providers: [{ provide: APP_INTERCEPTOR, useClass: HandlerLoggingInterceptor }],
})
export class AppModule {}
