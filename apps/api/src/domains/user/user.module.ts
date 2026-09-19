import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { BankAccountDataModule } from "../bank-account/bank-account.data.module";
import { CardLimitDataModule } from "../card-limit/card-limit.data.module";
import { CountryDataModule } from "../country/country.data.module";
import { DebtDataModule } from "../debt/debt.data.module";
import { InstallmentPlanDataModule } from "../installment-plan/installment-plan.data.module";
import { MfaRecoveryCodeDataModule } from "../mfa-recovery-code/mfa-recovery-code.data.module";
import { PasskeyDataModule } from "../passkey/passkey.data.module";
import { RecurringExpenseDataModule } from "../recurring-expense/recurring-expense.data.module";
import { SavingsEntryDataModule } from "../savings-entry/savings-entry.data.module";
import { SavingsGoalDataModule } from "../savings-goal/savings-goal.data.module";
import { TransactionDataModule } from "../transaction/transaction.data.module";
import { ChangePasswordHandler } from "./application/commands/change-password.handler";
import { ConfirmMfaEnrollmentHandler } from "./application/commands/confirm-mfa-enrollment.handler";
import { ConfirmPasskeyRegistrationHandler } from "./application/commands/confirm-passkey-registration.handler";
import { DeactivateAccountHandler } from "./application/commands/deactivate-account.handler";
import { DisableMfaHandler } from "./application/commands/disable-mfa.handler";
import { LoginHandler } from "./application/commands/login.handler";
import { RefreshTokenHandler } from "./application/commands/refresh-token.handler";
import { RegisterHandler } from "./application/commands/register.handler";
import { RemovePasskeyHandler } from "./application/commands/remove-passkey.handler";
import { StartMfaEnrollmentHandler } from "./application/commands/start-mfa-enrollment.handler";
import { StartPasskeyLoginHandler } from "./application/commands/start-passkey-login.handler";
import { StartPasskeyRegistrationHandler } from "./application/commands/start-passkey-registration.handler";
import { UpdatePreferencesHandler } from "./application/commands/update-preferences.handler";
import { UpdateProfileHandler } from "./application/commands/update-profile.handler";
import { VerifyMfaLoginHandler } from "./application/commands/verify-mfa-login.handler";
import { VerifyPasskeyLoginHandler } from "./application/commands/verify-passkey-login.handler";
import { GetMeQueryHandler } from "./application/queries/get-me.handler";
import { ListPasskeysQueryHandler } from "./application/queries/list-passkeys.handler";
import { PasskeyChallengeToken } from "./application/passkey-challenge-token";
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
  StartMfaEnrollmentHandler,
  ConfirmMfaEnrollmentHandler,
  DisableMfaHandler,
  VerifyMfaLoginHandler,
  StartPasskeyRegistrationHandler,
  ConfirmPasskeyRegistrationHandler,
  RemovePasskeyHandler,
  StartPasskeyLoginHandler,
  VerifyPasskeyLoginHandler,
];

const queryHandlers = [GetMeQueryHandler, ListPasskeysQueryHandler];

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
    MfaRecoveryCodeDataModule,
    PasskeyDataModule,
  ],
  controllers: [AuthController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    TokenIssuer,
    PasskeyChallengeToken,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    JwtAuthGuard,
  ],
})
export class UserModule {}
