import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { AccountsController } from "./accounts.controller";
import { AccountsRepository } from "./accounts.repository";
import { AccountsService } from "./accounts.service";
import { CardsRepository } from "./cards.repository";
import { CardsService } from "./cards.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AccountsController],
  providers: [AccountsService, AccountsRepository, CardsService, CardsRepository, JwtAuthGuard],
})
export class AccountsModule {}
