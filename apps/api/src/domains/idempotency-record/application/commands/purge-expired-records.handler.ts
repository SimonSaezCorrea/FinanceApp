import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  IDEMPOTENCY_RECORD_REPOSITORY,
  type IdempotencyRecordRepositoryPort,
} from "../../domain/ports/idempotency-record.repository.port";
import { PurgeExpiredRecordsCommand } from "./purge-expired-records.command";

/**
 * Drops attempts past their retention window, so the table does not grow without
 * bound (FR-016). Deleting a COMPLETED record only means a retry that arrives a
 * day late is treated as a new attempt — which is why the window is far longer
 * than any plausible client retry.
 */
@Injectable()
@CommandHandler(PurgeExpiredRecordsCommand)
export class PurgeExpiredRecordsHandler extends BaseCommandHandler<
  PurgeExpiredRecordsCommand,
  number,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) private readonly repo: IdempotencyRecordRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: PurgeExpiredRecordsCommand): Promise<HandleResult<number>> {
    const deleted = await this.repo.deleteExpired(command.now);
    return { result: deleted, events: [] };
  }
}
