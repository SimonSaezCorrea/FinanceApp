import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { BankAccountDataModule } from "../bank-account/bank-account.data.module";
import { CountryDataModule } from "../country/country.data.module";
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
  // Registration creates the user's cash account, so it needs that table's port.
  imports: [CqrsModule, JwtModule.register({}), CountryDataModule, BankAccountDataModule],
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
