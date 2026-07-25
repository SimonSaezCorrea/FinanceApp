import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { AccountsController } from "./accounts.controller";
import { AccountsRepository } from "./accounts.repository";
import { AccountsService } from "./accounts.service";
import { BillingGenerationService } from "./billing-generation.service";
import { CardsRepository } from "./cards.repository";
import { CardsService } from "./cards.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AccountsController],
  providers: [
    AccountsService,
    AccountsRepository,
    CardsService,
    CardsRepository,
    BillingGenerationService,
    JwtAuthGuard,
  ],
  // BillingGenerationService is reused by src/infra/cron (daily job) — same code
  // path as the manual "Generar facturación" button, no duplicated rules.
  exports: [BillingGenerationService],
})
export class AccountsModule {}
