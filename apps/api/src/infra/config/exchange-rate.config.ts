import { ConfigService } from "@nestjs/config";

/** Base URL of the exchange-rate source. Optional: the default is the public mindicador.cl API;
 * tests and staging point it elsewhere. Never throws at boot — a missing value is the default. */
export function getExchangeRateSourceUrl(config: ConfigService): string {
  const value = config.get<string>("EXCHANGE_RATE_SOURCE_URL");
  return value && value.trim().length > 0 ? value.trim().replace(/\/+$/, "") : DEFAULT_URL;
}

const DEFAULT_URL = "https://mindicador.cl/api";
