import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { PurgeExpiredRecordsHandler } from "./application/commands/purge-expired-records.handler";
import { IdempotencyRecordDataModule } from "./idempotency-record.data.module";

/**
 * Orchestration module: the handlers this domain owns. It imports the leaf, never
 * the other way round.
 *
 * The domain exposes no controller — the mechanism is invisible over HTTP by
 * design (FR-007). Its only command is the cron's purge.
 */
@Module({
  imports: [CqrsModule, IdempotencyRecordDataModule],
  providers: [PurgeExpiredRecordsHandler],
  exports: [IdempotencyRecordDataModule],
})
export class IdempotencyRecordModule {}
