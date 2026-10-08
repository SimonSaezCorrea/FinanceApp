import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { getExchangeRateSourceUrl } from "../../../infra/config/exchange-rate.config";
import {
  ExchangeRateSourceUnavailableError,
  type ExchangeRateSourcePort,
} from "../application/exchange-rate-source";
import type { PublishedValue, RateCurrency } from "../domain/exchange-rate.entity";

const TIMEOUT_MS = 10_000;
/** mindicador's own indicator codes. */
const INDICATOR: Record<RateCurrency, string> = { USD: "dolar", CLF: "uf" };

interface Quote {
  fecha?: unknown;
  valor?: unknown;
}

/** `fecha` is an instant at 03:00Z that names a calendar day: its UTC date IS that day (the
 * Chilean local date would slip a day back in winter time). */
function toValue(quote: Quote | undefined): PublishedValue {
  if (!quote || typeof quote.fecha !== "string" || typeof quote.valor !== "number") {
    throw new ExchangeRateSourceUnavailableError("unreadable quote");
  }
  const instant = new Date(quote.fecha);
  if (Number.isNaN(instant.getTime()) || !Number.isFinite(quote.valor) || quote.valor <= 0) {
    throw new ExchangeRateSourceUnavailableError("invalid quote");
  }
  return { valueDate: instant.toISOString().slice(0, 10), value: String(quote.valor) };
}

/** Adapter for mindicador.cl, over native `fetch` (same approach as `GeoIpLookup`). Any failure
 * becomes `ExchangeRateSourceUnavailableError`; it never returns partial data. */
@Injectable()
export class MindicadorSource implements ExchangeRateSourcePort {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = getExchangeRateSourceUrl(config);
  }

  async latest(): Promise<Record<RateCurrency, PublishedValue>> {
    const body = (await this.get(this.baseUrl)) as Record<string, Quote | undefined>;
    return { USD: toValue(body[INDICATOR.USD]), CLF: toValue(body[INDICATOR.CLF]) };
  }

  async series(currency: RateCurrency, year: number): Promise<PublishedValue[]> {
    const body = (await this.get(`${this.baseUrl}/${INDICATOR[currency]}/${year}`)) as {
      serie?: Quote[];
    };
    if (!Array.isArray(body.serie)) {
      throw new ExchangeRateSourceUnavailableError("missing series");
    }
    return body.serie.map(toValue);
  }

  private async get(url: string): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw new ExchangeRateSourceUnavailableError(`request failed: ${String(err)}`);
    }
    if (!res.ok) throw new ExchangeRateSourceUnavailableError(`status ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new ExchangeRateSourceUnavailableError("invalid JSON");
    }
  }
}
