import { Logger } from "@nestjs/common";

import {
  ExchangeRateSourceUnavailableError,
  type ExchangeRateSourcePort,
} from "../application/exchange-rate-source";
import type { PublishedValue, RateCurrency } from "../domain/exchange-rate.entity";

/**
 * Several sources in order of preference (Banco Central first, mindicador.cl behind it): each call
 * goes to the first one that answers. Only "unavailable" moves on to the next source; any other
 * error is a bug and surfaces as is. Unavailable only when every source is.
 */
export class FallbackExchangeRateSource implements ExchangeRateSourcePort {
  private readonly logger = new Logger(FallbackExchangeRateSource.name);

  constructor(private readonly sources: readonly ExchangeRateSourcePort[]) {
    if (sources.length === 0) throw new Error("FallbackExchangeRateSource needs a source");
  }

  latest(): Promise<Record<RateCurrency, PublishedValue>> {
    return this.first((source) => source.latest());
  }

  series(currency: RateCurrency, year: number): Promise<PublishedValue[]> {
    return this.first((source) => source.series(currency, year));
  }

  private async first<T>(call: (source: ExchangeRateSourcePort) => Promise<T>): Promise<T> {
    const reasons: string[] = [];
    for (const [index, source] of this.sources.entries()) {
      try {
        const result = await call(source);
        if (index > 0)
          this.logger.warn(`Exchange-rate source #${index + 1} used (${reasons.join("; ")})`);
        return result;
      } catch (err) {
        if (!(err instanceof ExchangeRateSourceUnavailableError)) throw err;
        reasons.push(`#${index + 1}: ${err.message}`);
      }
    }
    throw new ExchangeRateSourceUnavailableError(reasons.join("; "));
  }
}
