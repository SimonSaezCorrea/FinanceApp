import { Module } from "@nestjs/common";

import { SESSION_REPOSITORY } from "./domain/ports/session.repository.port";
import { PrismaSessionRepository } from "./infrastructure/prisma-session.repository";

/**
 * Data module for the `session` table. A `*.data.module.ts` is a LEAF: it provides one table's
 * port→adapter binding and imports no other domain — `user` composes this leaf directly.
 */
@Module({
  providers: [{ provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository }],
  exports: [SESSION_REPOSITORY],
})
export class SessionDataModule {}
