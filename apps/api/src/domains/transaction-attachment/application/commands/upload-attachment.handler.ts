import { Inject, Injectable, Logger } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { transactions } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { generateRowId } from "../../../../infra/id/generate-row-id";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
} from "../../../transaction/domain/ports/transaction.repository.port";
import { AttachmentPolicy, storageKeyFor } from "../../domain/attachment-policy";
import {
  AttachmentQuotaExceededError,
  AttachmentTransactionNotFoundError,
  AttachmentsUnavailableError,
} from "../../domain/errors";
import {
  ATTACHMENT_REPOSITORY,
  type AttachmentRepositoryPort,
  type AttachmentUsage,
} from "../../domain/ports/attachment.repository.port";
import { OBJECT_STORAGE, type ObjectStoragePort } from "../../domain/ports/object-storage.port";
import { UploadAttachmentCommand } from "./upload-attachment.command";

/**
 * Uploads a receipt: validates it for real (type + magic bytes + size), writes
 * the object, then the row. Ownership of the movement is checked FIRST — the
 * bytes of someone else's file never reach the bucket.
 */
/** Whether one more file of `size` bytes fits the person's and the movement's limits. */
function fitsQuota(usage: AttachmentUsage, size: number): boolean {
  return (
    usage.transactionCount < transactions.ATTACHMENT_MAX_PER_TRANSACTION &&
    usage.userCount < transactions.ATTACHMENT_MAX_PER_USER &&
    usage.userBytes + size <= transactions.ATTACHMENT_MAX_BYTES_PER_USER
  );
}

@Injectable()
@CommandHandler(UploadAttachmentCommand)
export class UploadAttachmentHandler extends BaseCommandHandler<
  UploadAttachmentCommand,
  transactions.Attachment,
  { storageKey: string; attachmentId: string }
> {
  private readonly logger = new Logger(UploadAttachmentHandler.name);

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

    // Security run-3: storage had no bound — any account could keep uploading forever. Checked
    // here so a full account never uploads, and again when the row is saved (run-4).
    const usage = await this.repo.usage(command.userId, command.transactionId);
    if (!fitsQuota(usage, command.file.size)) throw new AttachmentQuotaExceededError();

    const attachmentId = generateRowId();
    return {
      attachmentId,
      storageKey: storageKeyFor(),
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

    let saved;
    try {
      saved = await this.repo.saveWithinQuota(
        {
          id: context.attachmentId,
          userId: command.userId,
          transactionId: command.transactionId,
          storageKey: context.storageKey,
          fileName: command.file.originalname.slice(0, 255),
          contentType: command.file.mimetype,
          sizeBytes: command.file.size,
        },
        (now) => fitsQuota(now, command.file.size),
      );
      if (!saved) throw new AttachmentQuotaExceededError();
    } catch (err: unknown) {
      // The row didn't land (the movement was deleted meanwhile, the database failed): the file
      // just written has nothing pointing at it, so it goes too (security run-3).
      await this.storage.delete(context.storageKey).catch((cleanupErr: unknown) => {
        this.logger.warn(`could not delete an unsaved upload: ${String(cleanupErr)}`);
      });
      throw err;
    }

    return { result: saved.toContract(), events: [] };
  }
}
