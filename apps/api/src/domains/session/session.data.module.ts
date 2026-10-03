import { Module } from "@nestjs/common";

import { SESSION_REPOSITORY } from "./domain/ports/session.repository.port";
import { SESSION_STEP_UP } from "./domain/ports/session-step-up.port";
import { PrismaSessionRepository } from "./infrastructure/prisma-session.repository";

/**
 * Data module for the `session` table. A `*.data.module.ts` is a LEAF: it provides one table's
 * port→adapter binding and imports no other domain — `user` composes this leaf directly.
 */
@Module({
  providers: [
    PrismaSessionRepository,
    { provide: SESSION_REPOSITORY, useExisting: PrismaSessionRepository },
    // Same adapter, second (narrow) port — the step-up stamp on a session (2026-09-25).
    { provide: SESSION_STEP_UP, useExisting: PrismaSessionRepository },
  ],
  exports: [SESSION_REPOSITORY, SESSION_STEP_UP],
})
export class SessionDataModule {}
