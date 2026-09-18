import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { BankAccountDataModule } from "../bank-account/bank-account.data.module";
import { CardLimitDataModule } from "../card-limit/card-limit.data.module";
import { CountryDataModule } from "../country/country.data.module";
import { DebtDataModule } from "../debt/debt.data.module";
import { InstallmentPlanDataModule } from "../installment-plan/installment-plan.data.module";
import { RecurringExpenseDataModule } from "../recurring-expense/recurring-expense.data.module";
import { SavingsEntryDataModule } from "../savings-entry/savings-entry.data.module";
import { SavingsGoalDataModule } from "../savings-goal/savings-goal.data.module";
import { TransactionDataModule } from "../transaction/transaction.data.module";
import { ChangePasswordHandler } from "./application/commands/change-password.handler";
import { DeactivateAccountHandler } from "./application/commands/deactivate-account.handler";
import { LoginHandler } from "./application/commands/login.handler";
import { RefreshTokenHandler } from "./application/commands/refresh-token.handler";
import { RegisterHandler } from "./application/commands/register.handler";
import { UpdatePreferencesHandler } from "./application/commands/update-preferences.handler";
import { UpdateProfileHandler } from "./application/commands/update-profile.handler";
import { GetMeQueryHandler } from "./application/queries/get-me.handler";
import { TokenIssuer } from "./application/token-issuer";
import { USER_REPOSITORY } from "./domain/ports/user.repository.port";
import { PrismaUserRepository } from "./infrastructure/prisma-user.repository";
import { AuthController } from "./presentation/auth.controller";

const commandHandlers = [
  RegisterHandler,
  LoginHandler,
  RefreshTokenHandler,
  UpdateProfileHandler,
  ChangePasswordHandler,
  UpdatePreferencesHandler,
  DeactivateAccountHandler,
];

const queryHandlers = [GetMeQueryHandler];

@Module({
  // Registration creates the user's cash account, so it needs that table's port; the other 7
  // leaves are only for UpdatePreferencesHandler's currency-in-use check (specs/020).
  imports: [
    CqrsModule,
    JwtModule.register({}),
    CountryDataModule,
    BankAccountDataModule,
    TransactionDataModule,
    InstallmentPlanDataModule,
    DebtDataModule,
    SavingsGoalDataModule,
    SavingsEntryDataModule,
    RecurringExpenseDataModule,
    CardLimitDataModule,
  ],
  controllers: [AuthController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    TokenIssuer,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    JwtAuthGuard,
  ],
})
export class UserModule {}
