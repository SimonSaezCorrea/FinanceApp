import { Inject, Injectable, Logger } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import type { Attachment } from "../../domain/attachment.aggregate";
import { AttachmentNotFoundError } from "../../domain/errors";
import {
  ATTACHMENT_REPOSITORY,
  type AttachmentRepositoryPort,
} from "../../domain/ports/attachment.repository.port";
import { OBJECT_STORAGE, type ObjectStoragePort } from "../../domain/ports/object-storage.port";
import { RemoveAttachmentCommand } from "./remove-attachment.command";

/**
 * Deletes a receipt. The OBJECT is removed AFTER the database row (research D4):
 * a network call to the bucket must not sit inside a database transaction, and
 * an orphaned object is a cost problem while a row that refuses to be deleted is
 * a correctness one. A failed remote delete is logged with its key, not retried
 * into the user's face.
 */
@Injectable()
@CommandHandler(RemoveAttachmentCommand)
export class RemoveAttachmentHandler extends BaseCommandHandler<
  RemoveAttachmentCommand,
  void,
  Attachment
> {
  private readonly logger = new Logger(RemoveAttachmentHandler.name);

  constructor(
    eventBus: EventBus,
    @Inject(ATTACHMENT_REPOSITORY) private readonly repo: AttachmentRepositoryPort,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: RemoveAttachmentCommand): Promise<Attachment> {
    const found = await this.repo.findOne(
      command.userId,
      command.transactionId,
      command.attachmentId,
    );
    if (!found) throw new AttachmentNotFoundError();
    return found;
  }

  protected async handle(
    command: RemoveAttachmentCommand,
    attachment: Attachment,
  ): Promise<HandleResult<void>> {
    const removed = await this.repo.remove(command.userId, command.attachmentId);
    if (!removed) throw new AttachmentNotFoundError();

    try {
      await this.storage.delete(attachment.storageKey);
    } catch (error) {
      this.logger.error(
        `orphaned object left in the bucket: ${attachment.storageKey}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return { result: undefined, events: [] };
  }
}
