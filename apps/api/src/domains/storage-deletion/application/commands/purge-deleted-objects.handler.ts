import { Inject, Injectable, Logger } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from "../../../transaction-attachment/domain/ports/object-storage.port";
import {
  STORAGE_DELETION_REPOSITORY,
  type StorageDeletionRepositoryPort,
} from "../../domain/ports/storage-deletion.repository.port";
import { PurgeDeletedObjectsCommand } from "./purge-deleted-objects.command";

/** How many files one run deletes at most; the rest wait for the next run. */
export const PURGE_BATCH = 500;
/** A file is retried this many times; past that it stays queued and is only logged. */
export const PURGE_MAX_ATTEMPTS = 10;

export interface PurgeOutcome {
  deleted: number;
  failed: number;
  /** True when storage isn't configured: nothing can have been uploaded, nothing to delete. */
  skipped: boolean;
}

/**
 * Deletes each queued object, then its queue row. A delete that fails is counted and retried on
 * the next run (S3 deletes are idempotent, so a file deleted twice is harmless). A file that keeps
 * failing stops being retried after `PURGE_MAX_ATTEMPTS` and is left for a person to look at.
 */
@Injectable()
@CommandHandler(PurgeDeletedObjectsCommand)
export class PurgeDeletedObjectsHandler extends BaseCommandHandler<
  PurgeDeletedObjectsCommand,
  PurgeOutcome,
  null
> {
  private readonly logger = new Logger(PurgeDeletedObjectsHandler.name);

  constructor(
    eventBus: EventBus,
    @Inject(STORAGE_DELETION_REPOSITORY) private readonly queue: StorageDeletionRepositoryPort,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(): Promise<HandleResult<PurgeOutcome>> {
    if (!this.storage.isConfigured()) {
      return { result: { deleted: 0, failed: 0, skipped: true }, events: [] };
    }
    const pending = await this.queue.listPending(PURGE_BATCH, PURGE_MAX_ATTEMPTS);
    const done: string[] = [];
    const failed: string[] = [];
    for (const item of pending) {
      try {
        await this.storage.delete(item.storageKey);
        done.push(item.id);
      } catch (err: unknown) {
        failed.push(item.id);
        this.logger.warn(`could not delete a stored file (queue row ${item.id}): ${String(err)}`);
      }
    }
    await this.queue.remove(done);
    await this.queue.recordFailure(failed);
    return { result: { deleted: done.length, failed: failed.length, skipped: false }, events: [] };
  }
}
