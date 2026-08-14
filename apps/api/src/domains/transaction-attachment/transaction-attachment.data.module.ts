import { Module } from "@nestjs/common";

import { ATTACHMENT_REPOSITORY } from "./domain/ports/attachment.repository.port";
import { OBJECT_STORAGE } from "./domain/ports/object-storage.port";
import { PrismaAttachmentRepository } from "./infrastructure/prisma-attachment.repository";
import { S3ObjectStorageAdapter } from "./infrastructure/s3-object-storage.adapter";

/** Leaf data module for the `transaction-attachment` table: port→adapter
 *  bindings only, imports no other domain. */
@Module({
  providers: [
    { provide: ATTACHMENT_REPOSITORY, useClass: PrismaAttachmentRepository },
    { provide: OBJECT_STORAGE, useClass: S3ObjectStorageAdapter },
  ],
  exports: [ATTACHMENT_REPOSITORY, OBJECT_STORAGE],
})
export class TransactionAttachmentDataModule {}
