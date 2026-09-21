import { Module } from "@nestjs/common";

import { ACCOUNT_DELETION_LOG_REPOSITORY } from "./domain/ports/account-deletion-log.repository.port";
import { PrismaAccountDeletionLogRepository } from "./infrastructure/prisma-account-deletion-log.repository";

/**
 * Data module for the `account-deletion-log` table. A `*.data.module.ts` is a LEAF: it
 * provides one table's port→adapter binding and imports no other domain — `user` composes
 * this leaf directly.
 */
@Module({
  providers: [
    { provide: ACCOUNT_DELETION_LOG_REPOSITORY, useClass: PrismaAccountDeletionLogRepository },
  ],
  exports: [ACCOUNT_DELETION_LOG_REPOSITORY],
})
export class AccountDeletionLogDataModule {}
