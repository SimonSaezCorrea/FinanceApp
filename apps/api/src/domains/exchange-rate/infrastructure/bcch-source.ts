import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { getBcchApiToken } from "../../../infra/config/exchange-rate.config";
import {
  ExchangeRateSourceUnavailableError,
  type ExchangeRateSourcePort,
} from "../application/exchange-rate-source";
import {
  addDays,
  chileDay,
  latestPublishedOn,
  type PublishedValue,
  type RateCurrency,
} from "../domain/exchange-rate.entity";
import { fetchJson } from "./fetch-json";

const ENDPOINT = "https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx";
/** The Banco Central's own series codes (Base de Datos Estadísticos). */
const SERIES: Record<RateCurrency, string> = {
  USD: "F073.TCO.PRE.Z.D", // dólar observado, daily
  CLF: "F073.UFF.PRE.Z.D", // unidad de fomento, daily
};
/** How far back `latest()` looks: long enough to cross any run of holidays. */
const LATEST_WINDOW_DAYS = 20;

interface Observation {
  indexDateString?: unknown;
  value?: unknown;
  statusCode?: unknown;
}

const DECIMAL = /^\d+(\.\d+)?$/;

/** "22-10-2026" → "2026-10-22". */
function isoDay(raw: unknown): string {
  const match = typeof raw === "string" ? /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw) : null;
  if (!match) throw new ExchangeRateSourceUnavailableError("unreadable date");
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/**
 * Adapter for the Banco Central de Chile's statistics API (BDE, REST `GetSeries`), the official
 * publisher of both values — the primary source when `BCCH_API_TOKEN` is set, with mindicador.cl
 * behind it (`FallbackExchangeRateSource`). A day without publication (weekend, holiday) comes as
 * `statusCode: "ND"` and is skipped, exactly like a day mindicador doesn't list. Any other
 * oddity is `ExchangeRateSourceUnavailableError`: never partial data.
 */
@Injectable()
export class BcchSource implements ExchangeRateSourcePort {
  private readonly token: string;

  constructor(config: ConfigService) {
    const token = getBcchApiToken(config);
    if (!token) throw new Error("BcchSource needs BCCH_API_TOKEN");
    this.token = token;
  }

  async latest(): Promise<Record<RateCurrency, PublishedValue>> {
    const today = chileDay(new Date());
    const from = addDays(today, -LATEST_WINDOW_DAYS);
    const pick = async (currency: RateCurrency) => {
      // The UF is published ahead: the value FOR today, not the newest one.
      const value = latestPublishedOn(await this.observations(currency, from, today), today);
      if (!value) throw new ExchangeRateSourceUnavailableError(`no recent ${currency} value`);
      return value;
    };
    const [usd, clf] = await Promise.all([pick("USD"), pick("CLF")]);
    return { USD: usd, CLF: clf };
  }

  series(currency: RateCurrency, year: number): Promise<PublishedValue[]> {
    return this.observations(currency, `${year}-01-01`, `${year}-12-31`);
  }

  private async observations(
    currency: RateCurrency,
    from: string,
    to: string,
  ): Promise<PublishedValue[]> {
    const url = new URL(ENDPOINT);
    url.searchParams.set("token", this.token);
    url.searchParams.set("function", "GetSeries");
    url.searchParams.set("timeseries", SERIES[currency]);
    url.searchParams.set("firstdate", from);
    url.searchParams.set("lastdate", to);

    const body = (await fetchJson(url.toString())) as {
      Codigo?: unknown;
      Series?: { Obs?: unknown };
    };
    if (body.Codigo !== 0) {
      throw new ExchangeRateSourceUnavailableError(`service code ${String(body.Codigo)}`);
    }
    const list = body.Series?.Obs;
    if (!Array.isArray(list)) throw new ExchangeRateSourceUnavailableError("missing Obs");

    const values: PublishedValue[] = [];
    for (const raw of list as Observation[]) {
      const valueDate = isoDay(raw.indexDateString);
      if (raw.statusCode !== "OK") continue;
      if (typeof raw.value !== "string" || !DECIMAL.test(raw.value) || Number(raw.value) <= 0) {
        throw new ExchangeRateSourceUnavailableError("invalid value");
      }
      values.push({ valueDate, value: raw.value });
    }
    return values;
  }
}
