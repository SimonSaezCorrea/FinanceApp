import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  ATTACHMENT_REPOSITORY,
  type AttachmentRepositoryPort,
} from "../../../transaction-attachment/domain/ports/attachment.repository.port";
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from "../../../transaction-attachment/domain/ports/object-storage.port";
import {
  STORAGE_DELETION_REPOSITORY,
  type StorageDeletionRepositoryPort,
} from "../../domain/ports/storage-deletion.repository.port";
import { SweepOrphanObjectsCommand } from "./sweep-orphan-objects.command";

/** Objects listed per page, and pages per run (20,000 objects a day at most). A run that stops at
 * the page cap leaves its last key, and the next run starts after it (security run-4: every run
 * used to start over, so objects past the first 20,000 were never reached). */
export const SWEEP_PAGE = 1000;
export const SWEEP_MAX_PAGES = 20;
/** Younger files are left alone: an upload writes the file first and its row right after. */
export const SWEEP_MIN_AGE_MS = 24 * 60 * 60 * 1000;
/** Every key this app writes is a random UUID (`storageKeyFor`); anything else isn't ours. */
const STORAGE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SweepOutcome {
  scanned: number;
  queued: number;
  skipped: boolean;
}

@Injectable()
@CommandHandler(SweepOrphanObjectsCommand)
export class SweepOrphanObjectsHandler extends BaseCommandHandler<
  SweepOrphanObjectsCommand,
  SweepOutcome,
  null
> {
  /** Where the next run starts: the last key the previous one reached, or the beginning. Kept in
   * memory (the handler is a singleton); a restart starts over, which only repeats work. */
  private resumeAfter: string | null = null;

  constructor(
    eventBus: EventBus,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(ATTACHMENT_REPOSITORY) private readonly attachments: AttachmentRepositoryPort,
    @Inject(STORAGE_DELETION_REPOSITORY) private readonly queue: StorageDeletionRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: SweepOrphanObjectsCommand): Promise<HandleResult<SweepOutcome>> {
    if (!this.storage.isConfigured()) {
      return { result: { scanned: 0, queued: 0, skipped: true }, events: [] };
    }
    const cutoff = command.now.getTime() - SWEEP_MIN_AGE_MS;
    let cursor: string | null = null;
    let scanned = 0;
    let queued = 0;
    let lastKey: string | null = null;
    let more = false;
    const startAfter = this.resumeAfter;
    for (let page = 0; page < SWEEP_MAX_PAGES; page++) {
      const { items, next } = await this.storage.listPage(cursor, SWEEP_PAGE, startAfter);
      scanned += items.length;
      if (items.length > 0) lastKey = items[items.length - 1]!.key;
      more = next !== null;
      const candidates = items
        .filter((o) => STORAGE_KEY.test(o.key))
        .filter((o) => o.lastModified !== null && o.lastModified.getTime() < cutoff)
        .map((o) => o.key);
      if (candidates.length > 0) {
        const [kept, already] = await Promise.all([
          this.attachments.existingStorageKeys(candidates),
          this.queue.queuedKeys(candidates),
        ]);
        const orphans = candidates.filter((k) => !kept.has(k) && !already.has(k));
        await this.queue.enqueue(orphans);
        queued += orphans.length;
      }
      if (!next) break;
      cursor = next;
    }
    // Stopped at the page cap: continue after the last key next time. Reached the end: start over.
    this.resumeAfter = more ? lastKey : null;
    return { result: { scanned, queued, skipped: false }, events: [] };
  }
}
