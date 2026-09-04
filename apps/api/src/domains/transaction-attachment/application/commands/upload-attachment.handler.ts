import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { generateRowId } from "../../../../infra/id/generate-row-id";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
} from "../../../transaction/domain/ports/transaction.repository.port";
import { AttachmentPolicy, storageKeyFor } from "../../domain/attachment-policy";
import {
  AttachmentTransactionNotFoundError,
  AttachmentsUnavailableError,
} from "../../domain/errors";
import {
  ATTACHMENT_REPOSITORY,
  type AttachmentRepositoryPort,
} from "../../domain/ports/attachment.repository.port";
import { OBJECT_STORAGE, type ObjectStoragePort } from "../../domain/ports/object-storage.port";
import { UploadAttachmentCommand } from "./upload-attachment.command";

/**
 * Uploads a receipt: validates it for real (type + magic bytes + size), writes
 * the object, then the row. Ownership of the movement is checked FIRST — the
 * bytes of someone else's file never reach the bucket.
 */
@Injectable()
@CommandHandler(UploadAttachmentCommand)
export class UploadAttachmentHandler extends BaseCommandHandler<
  UploadAttachmentCommand,
  transactions.Attachment,
  { storageKey: string; attachmentId: string }
> {
  constructor(
    eventBus: EventBus,
    @Inject(ATTACHMENT_REPOSITORY) private readonly repo: AttachmentRepositoryPort,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(TRANSACTION_REPOSITORY) private readonly transactions: TransactionRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(
    command: UploadAttachmentCommand,
  ): Promise<{ storageKey: string; attachmentId: string }> {
    if (!this.storage.isConfigured()) throw new AttachmentsUnavailableError();

    const movement = await this.transactions.findOne(command.userId, command.transactionId);
    if (!movement) throw new AttachmentTransactionNotFoundError();

    AttachmentPolicy.validate({
      fileName: command.file.originalname,
      contentType: command.file.mimetype,
      sizeBytes: command.file.size,
      bytes: new Uint8Array(command.file.buffer),
    });

    const attachmentId = generateRowId();
    return {
      attachmentId,
      storageKey: storageKeyFor({
        userId: command.userId,
        transactionId: command.transactionId,
        attachmentId,
        fileName: command.file.originalname,
      }),
    };
  }

  protected async handle(
    command: UploadAttachmentCommand,
    context: { storageKey: string; attachmentId: string },
  ): Promise<HandleResult<transactions.Attachment>> {
    await this.storage.put(
      context.storageKey,
      new Uint8Array(command.file.buffer),
      command.file.mimetype,
    );

    const saved = await this.repo.save({
      id: context.attachmentId,
      userId: command.userId,
      transactionId: command.transactionId,
      storageKey: context.storageKey,
      fileName: command.file.originalname.slice(0, 255),
      contentType: command.file.mimetype,
      sizeBytes: command.file.size,
    });

    return { result: saved.toContract(), events: [] };
  }
}
