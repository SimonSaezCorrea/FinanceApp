import { Injectable, Logger } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Cron } from "@nestjs/schedule";

import { CronSwitch } from "../config/cron.config";
import { PurgeExpiredRecordsCommand } from "../../domains/idempotency-record/application/commands/purge-expired-records.command";
import { PurgeExpiredCacheCommand } from "../../domains/ip-geolocation-cache/application/commands/purge-expired-cache.command";
import { CloseExpiredSessionsCommand } from "../../domains/user/application/commands/close-expired-sessions.command";
import { PurgeClosedSessionsCommand } from "../../domains/user/application/commands/purge-closed-sessions.command";
import { PurgeStaleEmailTokensCommand } from "../../domains/user/application/commands/purge-stale-email-tokens.command";

/**
 * Daily housekeeping at 03:00 Chile time — one trigger for what used to be three crons (3, 4 and
 * 5 AM, merged 2026-10-10). None of it changes what a user sees: every reader already ignores
 * expired rows; this only keeps the tables from growing without bound.
 *
 * 1. Idempotency attempts past their retention window (FR-016).
 * 2. Sessions: stamp `closedAt` on the naturally expired ones, THEN purge those closed past the
 *    3-day retention — in this order, so one that just expired starts its retention today.
 * 3. IP→country cache rows past their 60-day TTL (specs/026).
 * 4. Email links expired or used more than 7 days ago (specs/032).
 *
 * Each step runs on its own: one failing is logged and never stops the others.
 */
@Injectable()
export class MaintenanceCron {
  private readonly logger = new Logger(MaintenanceCron.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly crons: CronSwitch,
  ) {}

  @Cron("0 3 * * *", { timeZone: "America/Santiago" })
  async run(): Promise<void> {
    if (!this.crons.enabled) return;
    await this.step("idempotency records", async () => {
      const deleted = await this.commandBus.execute<PurgeExpiredRecordsCommand, number>(
        new PurgeExpiredRecordsCommand(),
      );
      return `purged ${deleted} expired`;
    });
    await this.step("sessions", async () => {
      const closed = await this.commandBus.execute<CloseExpiredSessionsCommand, number>(
        new CloseExpiredSessionsCommand(),
      );
      const purged = await this.commandBus.execute<PurgeClosedSessionsCommand, number>(
        new PurgeClosedSessionsCommand(),
      );
      return `closed ${closed} expired, purged ${purged} past retention`;
    });
    await this.step("IP geolocation cache", async () => {
      const deleted = await this.commandBus.execute<PurgeExpiredCacheCommand, number>(
        new PurgeExpiredCacheCommand(),
      );
      return `purged ${deleted} expired rows`;
    });
    await this.step("email links", async () => {
      const deleted = await this.commandBus.execute<PurgeStaleEmailTokensCommand, number>(
        new PurgeStaleEmailTokensCommand(),
      );
      return `purged ${deleted} expired or used`;
    });
  }

  private async step(name: string, work: () => Promise<string>): Promise<void> {
    try {
      this.logger.log(`${name}: ${await work()}`);
    } catch (err: unknown) {
      this.logger.error(`${name} failed: ${String(err)}`);
    }
  }
}
