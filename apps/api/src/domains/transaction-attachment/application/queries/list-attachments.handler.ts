import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { transactions } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import type { Attachment } from "../../domain/attachment.aggregate";
import { AttachmentNotFoundError, AttachmentsUnavailableError } from "../../domain/errors";
import {
  ATTACHMENT_REPOSITORY,
  type AttachmentRepositoryPort,
} from "../../domain/ports/attachment.repository.port";
import { OBJECT_STORAGE, type ObjectStoragePort } from "../../domain/ports/object-storage.port";
import { GetAttachmentUrlQuery, ListAttachmentsQuery } from "./list-attachments.query";

/** Five minutes: long enough to open the file, short enough that a leaked link
 *  is worthless soon after. */
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Listing works even with no bucket configured (it just returns whatever rows
 * exist, normally none), so the panel's section always renders — only reading a
 * file's bytes needs the storage.
 */
@Injectable()
@QueryHandler(ListAttachmentsQuery)
export class ListAttachmentsQueryHandler extends BaseQueryHandler<
  ListAttachmentsQuery,
  transactions.Attachment[],
  Attachment[]
> {
  constructor(@Inject(ATTACHMENT_REPOSITORY) private readonly repo: AttachmentRepositoryPort) {
    super();
  }

  protected async loadContext(query: ListAttachmentsQuery): Promise<Attachment[]> {
    return this.repo.listForTransaction(query.userId, query.transactionId);
  }

  protected async handle(
    _query: ListAttachmentsQuery,
    rows: Attachment[],
  ): Promise<transactions.Attachment[]> {
    return rows.map((r) => r.toContract());
  }
}

@Injectable()
@QueryHandler(GetAttachmentUrlQuery)
export class GetAttachmentUrlQueryHandler extends BaseQueryHandler<
  GetAttachmentUrlQuery,
  transactions.AttachmentUrl,
  Attachment
> {
  constructor(
    @Inject(ATTACHMENT_REPOSITORY) private readonly repo: AttachmentRepositoryPort,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {
    super();
  }

  protected async loadContext(query: GetAttachmentUrlQuery): Promise<Attachment> {
    if (!this.storage.isConfigured()) throw new AttachmentsUnavailableError();
    const found = await this.repo.findOne(query.userId, query.transactionId, query.attachmentId);
    if (!found) throw new AttachmentNotFoundError();
    return found;
  }

  protected async handle(
    _query: GetAttachmentUrlQuery,
    attachment: Attachment,
  ): Promise<transactions.AttachmentUrl> {
    const url = await this.storage.getSignedUrl(attachment.storageKey, SIGNED_URL_TTL_SECONDS);
    return {
      url,
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }
}
