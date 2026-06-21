import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AccountsModule } from "./domains/accounts/accounts.module";
import { AuthModule } from "./domains/auth/auth.module";
import { DebtsModule } from "./domains/debts/debts.module";
import { HealthModule } from "./domains/health/health.module";
import { ImportModule } from "./domains/import/import.module";
import { InstallmentsModule } from "./domains/installments/installments.module";
import { InvestmentsModule } from "./domains/investments/investments.module";
import { RecurringModule } from "./domains/recurring/recurring.module";
import { SavingsModule } from "./domains/savings/savings.module";
import { TransactionsModule } from "./domains/transactions/transactions.module";
import { WalletModule } from "./domains/wallet/wallet.module";
import { PrismaModule } from "./infra/prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    AccountsModule,
    TransactionsModule,
    InstallmentsModule,
    DebtsModule,
    SavingsModule,
    InvestmentsModule,
    ImportModule,
    RecurringModule,
    WalletModule,
  ],
})
export class AppModule {}
