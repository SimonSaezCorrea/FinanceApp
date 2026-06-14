import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { AccountsController } from "./accounts.controller";
import { AccountsRepository } from "./accounts.repository";
import { AccountsService } from "./accounts.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AccountsController],
  providers: [AccountsService, AccountsRepository, JwtAuthGuard],
})
export class AccountsModule {}
