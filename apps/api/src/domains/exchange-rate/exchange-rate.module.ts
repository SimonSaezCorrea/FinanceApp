import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { getBcchApiToken } from "../../infra/config/exchange-rate.config";
import { RecordExchangeRatesHandler } from "./application/commands/record-exchange-rates.handler";
import { EXCHANGE_RATE_SOURCE } from "./application/exchange-rate-source";
import { ListExchangeRatesQueryHandler } from "./application/queries/list-exchange-rates.handler";
import { ExchangeRateDataModule } from "./exchange-rate.data.module";
import { BcchSource } from "./infrastructure/bcch-source";
import { FallbackExchangeRateSource } from "./infrastructure/fallback-source";
import { MindicadorSource } from "./infrastructure/mindicador-source";
import { ExchangeRatesController } from "./presentation/exchange-rates.controller";
import { PublicExchangeRatesController } from "./presentation/public-exchange-rates.controller";

/**
 * Orchestration module for the `exchange-rate` table (spec 030): the daily dólar observado and
 * UF. Global, read-only reference data over HTTP — authed but NOT user-scoped, the same
 * documented exception to Principle II the other reference tables carry; `GET /public/exchange-rates`
 * (spec 033) is the same read with no session, Principle II's named public-read exception. The only writer is
 * the system command `RecordExchangeRatesCommand`, dispatched by `ExchangeRateCron`.
 */
@Module({
  imports: [CqrsModule, JwtModule.register({}), ExchangeRateDataModule],
  controllers: [ExchangeRatesController, PublicExchangeRatesController],
  providers: [
    ListExchangeRatesQueryHandler,
    RecordExchangeRatesHandler,
    {
      // The Banco Central first when its token is configured, mindicador.cl behind it; without
      // the token, mindicador.cl alone.
      provide: EXCHANGE_RATE_SOURCE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        getBcchApiToken(config)
          ? new FallbackExchangeRateSource([new BcchSource(config), new MindicadorSource(config)])
          : new MindicadorSource(config),
    },
    JwtAuthGuard,
  ],
  exports: [ExchangeRateDataModule],
})
export class ExchangeRateModule {}
