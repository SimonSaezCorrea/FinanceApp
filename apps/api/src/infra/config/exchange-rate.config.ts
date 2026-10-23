import { ConfigService } from "@nestjs/config";

/** Base URL of the exchange-rate source. Optional: the default is the public mindicador.cl API;
 * tests and staging point it elsewhere. Never throws at boot — a missing value is the default. */
export function getExchangeRateSourceUrl(config: ConfigService): string {
  const value = config.get<string>("EXCHANGE_RATE_SOURCE_URL");
  return value && value.trim().length > 0 ? value.trim().replace(/\/+$/, "") : DEFAULT_URL;
}

const DEFAULT_URL = "https://mindicador.cl/api";

/** API Key Token of the Banco Central de Chile's statistics API (BDE). Optional: set, the BCCh is
 * the primary source with mindicador.cl behind it; absent, mindicador.cl alone (as before). The
 * token lasts one year: renew it in the BDE account and in Parameter Store. */
export function getBcchApiToken(config: ConfigService): string | null {
  const value = config.get<string>("BCCH_API_TOKEN")?.trim();
  return value ? value : null;
}
