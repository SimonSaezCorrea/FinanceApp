import { Module } from "@nestjs/common";

import { IDEMPOTENCY_RECORD_REPOSITORY } from "./domain/ports/idempotency-record.repository.port";
import { PrismaIdempotencyRecordRepository } from "./infrastructure/prisma-idempotency-record.repository";

/**
 * Leaf data module for the `idempotency-record` table. Imports no other domain,
 * so every domain that needs retry-safety can depend on it without creating a
 * cycle — orchestration depends on leaves, never the reverse (Principle VI).
 */
@Module({
  providers: [
    { provide: IDEMPOTENCY_RECORD_REPOSITORY, useClass: PrismaIdempotencyRecordRepository },
  ],
  exports: [IDEMPOTENCY_RECORD_REPOSITORY],
})
export class IdempotencyRecordDataModule {}
