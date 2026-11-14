import { Module } from "@nestjs/common";

import { STORAGE_DELETION_REPOSITORY } from "./domain/ports/storage-deletion.repository.port";
import { PrismaStorageDeletionRepository } from "./infrastructure/prisma-storage-deletion.repository";

/** Leaf data module for the `storage-deletion` table: the port→adapter binding only. */
@Module({
  providers: [{ provide: STORAGE_DELETION_REPOSITORY, useClass: PrismaStorageDeletionRepository }],
  exports: [STORAGE_DELETION_REPOSITORY],
})
export class StorageDeletionDataModule {}
