import { Module } from "@nestjs/common";

import { CONSENT_RECORD_REPOSITORY } from "./domain/ports/consent-record.repository.port";
import { PrismaConsentRecordRepository } from "./infrastructure/prisma-consent-record.repository";

/**
 * Data module for the `consent-record` table. A `*.data.module.ts` is a LEAF: it provides one
 * table's port→adapter binding and imports no other domain — `user` composes this leaf directly.
 */
@Module({
  providers: [{ provide: CONSENT_RECORD_REPOSITORY, useClass: PrismaConsentRecordRepository }],
  exports: [CONSENT_RECORD_REPOSITORY],
})
export class ConsentRecordDataModule {}
