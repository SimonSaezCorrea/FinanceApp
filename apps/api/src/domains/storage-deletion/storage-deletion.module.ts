import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { TransactionAttachmentDataModule } from "../transaction-attachment/transaction-attachment.data.module";
import { PurgeDeletedObjectsHandler } from "./application/commands/purge-deleted-objects.handler";
import { StorageDeletionDataModule } from "./storage-deletion.data.module";

/**
 * Orchestration module for the `storage-deletion` table (security run-3). No controller: rows are
 * written by a database trigger and read only by the maintenance cron. It reaches the bytes through
 * `transaction-attachment`'s own storage port, never a second S3 client.
 */
@Module({
  imports: [CqrsModule, StorageDeletionDataModule, TransactionAttachmentDataModule],
  providers: [PurgeDeletedObjectsHandler],
})
export class StorageDeletionModule {}
