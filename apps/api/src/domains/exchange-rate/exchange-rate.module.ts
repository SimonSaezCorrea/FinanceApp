import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { RecordExchangeRatesHandler } from "./application/commands/record-exchange-rates.handler";
import { EXCHANGE_RATE_SOURCE } from "./application/exchange-rate-source";
import { ListExchangeRatesQueryHandler } from "./application/queries/list-exchange-rates.handler";
import { ExchangeRateDataModule } from "./exchange-rate.data.module";
import { MindicadorSource } from "./infrastructure/mindicador-source";
import { ExchangeRatesController } from "./presentation/exchange-rates.controller";

/**
 * Orchestration module for the `exchange-rate` table (spec 030): the daily dólar observado and
 * UF. Global, read-only reference data over HTTP — authed but NOT user-scoped, the same
 * documented exception to Principle II the other reference tables carry. The only writer is
 * the system command `RecordExchangeRatesCommand`, dispatched by `ExchangeRateCron`.
 */
@Module({
  imports: [CqrsModule, JwtModule.register({}), ExchangeRateDataModule],
  controllers: [ExchangeRatesController],
  providers: [
    ListExchangeRatesQueryHandler,
    RecordExchangeRatesHandler,
    { provide: EXCHANGE_RATE_SOURCE, useClass: MindicadorSource },
    JwtAuthGuard,
  ],
  exports: [ExchangeRateDataModule],
})
export class ExchangeRateModule {}
