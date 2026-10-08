import { DomainError } from "../../../infra/domain/domain-error";
import type { PublishedValue, RateCurrency } from "../domain/exchange-rate.entity";

export const EXCHANGE_RATE_SOURCE = Symbol("EXCHANGE_RATE_SOURCE");

/** The source answered with something unusable, or did not answer at all. Callers treat it as
 * "no value today": they never invent one and they retry on the next tick. */
export class ExchangeRateSourceUnavailableError extends DomainError {
  constructor(reason: string) {
    super("EXCHANGE_RATE_SOURCE_UNAVAILABLE", 400);
    this.message = reason;
  }
}

/** Port to wherever the daily values come from (today: mindicador.cl). */
export interface ExchangeRateSourcePort {
  /** The most recent published value of each currency, in one call. */
  latest(): Promise<Record<RateCurrency, PublishedValue>>;
  /** Every value the source published for `currency` in calendar `year`, in any order. Entries
   * dated in the future (the UF is published ahead) are included; the caller discards them. */
  series(currency: RateCurrency, year: number): Promise<PublishedValue[]>;
}
