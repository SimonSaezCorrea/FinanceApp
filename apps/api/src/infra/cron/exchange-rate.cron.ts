import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Cron } from "@nestjs/schedule";

import { RecordExchangeRatesCommand } from "../../domains/exchange-rate/application/commands/record-exchange-rates.command";

/** The last tick of the day, in Chile's hour. */
const LAST_TICK_HOUR = 20;

/** Current hour in Chile (0-23), whatever the server's own time zone. */
function chileHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Santiago",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}

/**
 * Records the daily dólar observado and UF (spec 030). A thin trigger: it only dispatches the
 * system command.
 *
 * Every hour from 08:00 to 20:00 Chile time. The dólar of the day is usually not published at
 * 08:00, so the later ticks are how the real value replaces the carried one; the 20:00 tick is
 * the last chance, after which a dead source leaves the day with the last known value.
 *
 * It also runs once at boot (not under tests), so a fresh install seeds its history at start-up
 * instead of waiting for the next tick; the handler is idempotent, so that is always safe.
 */
@Injectable()
export class ExchangeRateCron implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExchangeRateCron.name);

  constructor(private readonly commandBus: CommandBus) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === "test") return;
    void this.record(new Date()).catch((err: unknown) =>
      this.logger.error(`Initial exchange-rate recording failed: ${String(err)}`),
    );
  }

  @Cron("0 8-20 * * *", { timeZone: "America/Santiago" })
  async run(): Promise<void> {
    await this.record(new Date());
  }

  private async record(now: Date): Promise<void> {
    await this.commandBus.execute(
      new RecordExchangeRatesCommand(now, chileHour(now) >= LAST_TICK_HOUR),
    );
  }
}
