import { Injectable, Logger } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Cron, CronExpression } from "@nestjs/schedule";

import { PurgeExpiredCacheCommand } from "../../domains/ip-geolocation-cache/application/commands/purge-expired-cache.command";

/** Daily sweep of IP→country cache rows past their 60-day TTL (specs/026) — same thin-trigger
 * shape as `IdempotencyCleanupCron`, offset to 5AM so it doesn't compete with that one (3AM) or
 * `SessionCleanupCron` (4AM). */
@Injectable()
export class IpGeolocationCachePurgeCron {
  private readonly logger = new Logger(IpGeolocationCachePurgeCron.name);

  constructor(private readonly commandBus: CommandBus) {}

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async run(): Promise<void> {
    const deleted = await this.commandBus.execute(new PurgeExpiredCacheCommand());
    this.logger.log(`Purged ${deleted} expired IP geolocation cache rows`);
  }
}
