import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { ListCurrenciesQueryHandler } from "./application/queries/list-currencies.handler";
import { CURRENCY_REPOSITORY } from "./domain/ports/currency.repository.port";
import { PrismaCurrencyRepository } from "./infrastructure/prisma-currency.repository";
import { CurrenciesController } from "./presentation/currencies.controller";

/** Orchestration module for the `currency` table (global, read-only, seeded). */
@Module({
  imports: [CqrsModule, JwtModule.register({})],
  controllers: [CurrenciesController],
  providers: [
    ListCurrenciesQueryHandler,
    { provide: CURRENCY_REPOSITORY, useClass: PrismaCurrencyRepository },
    JwtAuthGuard,
  ],
})
export class CurrencyModule {}
