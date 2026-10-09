import { Inject, Injectable, Logger } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  RATE_CURRENCIES,
  addDays,
  chileDay,
  daysBetween,
  isPublishedOnItsDay,
  latestPublishedOn,
  nextDay,
  type ExchangeRateEntry,
  type PublishedValue,
  type RateCurrency,
} from "../../domain/exchange-rate.entity";
import {
  EXCHANGE_RATE_REPOSITORY,
  type ExchangeRateRepositoryPort,
} from "../../domain/ports/exchange-rate.repository.port";
import {
  EXCHANGE_RATE_SOURCE,
  ExchangeRateSourceUnavailableError,
  type ExchangeRateSourcePort,
} from "../exchange-rate-source";
import { RecordExchangeRatesCommand } from "./record-exchange-rates.command";

/** How much history an empty table is seeded with, today included. */
const SEED_DAYS = 365;

export type RecordOutcome =
  /** Today's real value was already stored for both currencies: nothing to do. */
  | "complete"
  /** The source answered and today is stored (real or, if it has not renewed, carried). */
  | "recorded"
  /** The source stayed down on the last tick: today carries the last known value. */
  | "carried"
  /** The source is down and it is not the last tick yet (or there is nothing to carry). */
  | "unavailable";

export interface RecordResult {
  outcome: RecordOutcome;
  /** Rows written by this tick. */
  written: number;
}

/**
 * Records the daily dólar observado and UF (spec 030), idempotent by construction: every write
 * is an upsert on the natural key `(currency, date)` that can only raise `valueDate`, so
 * overlapping ticks, a retry or two instances leave one row per currency and day (Principle VII,
 * form b).
 *
 * The source never gets to invent a value for us and we never invent one for it: a failed call
 * writes NOTHING, and only the last tick of the day copies the last KNOWN value forward, marked
 * as carried by its older `valueDate`. The real publication, whenever it arrives, replaces it.
 */
@Injectable()
@CommandHandler(RecordExchangeRatesCommand)
export class RecordExchangeRatesHandler extends BaseCommandHandler<
  RecordExchangeRatesCommand,
  RecordResult,
  null
> {
  private readonly logger = new Logger(RecordExchangeRatesHandler.name);

  constructor(
    eventBus: EventBus,
    @Inject(EXCHANGE_RATE_REPOSITORY) private readonly repo: ExchangeRateRepositoryPort,
    @Inject(EXCHANGE_RATE_SOURCE) private readonly source: ExchangeRateSourcePort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: RecordExchangeRatesCommand): Promise<HandleResult<RecordResult>> {
    return { result: await this.record(command), events: [] };
  }

  private async record(command: RecordExchangeRatesCommand): Promise<RecordResult> {
    const today = chileDay(command.now);

    const todayRows = await this.repo.findRange(undefined, today, today);
    const complete = RATE_CURRENCIES.every((c) =>
      todayRows.some((r) => r.currency === c && isPublishedOnItsDay(r)),
    );
    if (complete) return { outcome: "complete", written: 0 };

    let latest: Record<RateCurrency, PublishedValue>;
    try {
      latest = await this.source.latest();
    } catch (err) {
      if (!(err instanceof ExchangeRateSourceUnavailableError)) throw err;
      this.logger.warn(`Exchange-rate source unavailable: ${err.message}`);
      return command.isLastTickOfDay
        ? await this.carryForward(today)
        : { outcome: "unavailable", written: 0 };
    }

    let written = 0;
    for (const currency of RATE_CURRENCIES) {
      written += await this.fillGap(currency, today);
      written += await this.recordToday(currency, today, latest[currency]);
    }
    this.logger.log(`Exchange rates recorded for ${today} (${written} row(s) written)`);
    return { outcome: "recorded", written };
  }

  /** Days between the last stored one and today (or a year back, on an empty table), each given
   * the latest value published on or before it. A failing history call leaves the gap for the
   * next tick; it never blocks recording today. */
  private async fillGap(currency: RateCurrency, today: string): Promise<number> {
    const last = await this.repo.lastDate(currency);
    const from = last ? nextDay(last) : addDays(today, -(SEED_DAYS - 1));
    if (from >= today) return 0;

    let published: PublishedValue[];
    try {
      published = await this.seriesCovering(currency, from, today);
    } catch (err) {
      if (!(err instanceof ExchangeRateSourceUnavailableError)) throw err;
      this.logger.warn(`Exchange-rate history unavailable for ${currency}: ${err.message}`);
      return 0;
    }

    const entries: ExchangeRateEntry[] = [];
    for (const date of daysBetween(from, addDays(today, -1))) {
      const value = latestPublishedOn(published, date);
      if (value) entries.push({ currency, date, ...value });
    }
    await this.repo.upsertMany(entries);
    return entries.length;
  }

  private async recordToday(
    currency: RateCurrency,
    today: string,
    latest: PublishedValue,
  ): Promise<number> {
    let value: PublishedValue | null = latest;
    if (latest.valueDate > today) {
      // The UF is published ahead: a value dated after today answers for a later day.
      try {
        value = latestPublishedOn(await this.seriesCovering(currency, today, today), today);
      } catch (err) {
        if (!(err instanceof ExchangeRateSourceUnavailableError)) throw err;
        value = null;
      }
    }
    if (!value) return 0;
    await this.repo.upsert({ currency, date: today, ...value });
    return 1;
  }

  /** Every published value of the calendar years `from`..`to` touch (a window crossing New
   * Year needs both yearly series). */
  private async seriesCovering(
    currency: RateCurrency,
    from: string,
    to: string,
  ): Promise<PublishedValue[]> {
    const firstYear = Number(from.slice(0, 4));
    const lastYear = Number(to.slice(0, 4));
    const all: PublishedValue[] = [];
    for (let year = firstYear; year <= lastYear; year++) {
      all.push(...(await this.source.series(currency, year)));
    }
    return all;
  }

  /** The source stayed down all day: every missing day up to today keeps the last known value,
   * still showing its own (older) `valueDate`. Nothing is invented on an empty table. */
  private async carryForward(today: string): Promise<RecordResult> {
    let written = 0;
    for (const currency of RATE_CURRENCIES) {
      const last = await this.repo.findLatest(currency);
      if (!last || last.date >= today) continue;
      const entries = daysBetween(nextDay(last.date), today).map((date) => ({
        currency,
        date,
        value: last.value,
        valueDate: last.valueDate,
      }));
      await this.repo.upsertMany(entries);
      written += entries.length;
    }
    return { outcome: written > 0 ? "carried" : "unavailable", written };
  }
}
