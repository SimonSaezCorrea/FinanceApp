import { Injectable, Logger } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Cron, CronExpression } from "@nestjs/schedule";

import { PurgeExpiredRecordsCommand } from "../../domains/idempotency-record/application/commands/purge-expired-records.command";

/** Daily sweep of idempotency attempts past their retention window (FR-016),
 * so the table doesn't grow without bound. Same thin-trigger shape as
 * `BillingGenerationCron`. */
@Injectable()
export class IdempotencyCleanupCron {
  private readonly logger = new Logger(IdempotencyCleanupCron.name);

  constructor(private readonly commandBus: CommandBus) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<void> {
    const deleted = await this.commandBus.execute(new PurgeExpiredRecordsCommand());
    this.logger.log(`Purged ${deleted} expired idempotency records`);
  }
}
