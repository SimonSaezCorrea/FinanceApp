import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Cron } from "@nestjs/schedule";

import { CronSwitch } from "../config/cron.config";
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
 * Every hour from 08:00 to 20:00, Chile time. Once today's real values are stored a tick returns
 * without calling anyone, so the extra ticks only cost something while the source is failing —
 * which is exactly when they matter: on 2026-10-22 the four ticks then in place (08/12/16/20)
 * all timed out and the day was carried. The 20:00 tick is the last chance, after which a dead
 * source leaves the day with the last known value (repaired by the next run that reaches it).
 *
 * It also runs once at boot, so a fresh install seeds its history at start-up
 * instead of waiting for the next tick; the handler is idempotent, so that is always safe.
 * Nothing runs unless `CronSwitch` says so (production, or CRONS_ENABLED=true).
 */
@Injectable()
export class ExchangeRateCron implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExchangeRateCron.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly crons: CronSwitch,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.crons.enabled) return;
    void this.record(new Date()).catch((err: unknown) =>
      this.logger.error(`Initial exchange-rate recording failed: ${String(err)}`),
    );
  }

  @Cron("0 8-20 * * *", { timeZone: "America/Santiago" })
  async run(): Promise<void> {
    if (!this.crons.enabled) return;
    await this.record(new Date());
  }

  private async record(now: Date): Promise<void> {
    await this.commandBus.execute(
      new RecordExchangeRatesCommand(now, chileHour(now) >= LAST_TICK_HOUR),
    );
  }
}
