import { Module } from "@nestjs/common";

import { PASSKEY_REPOSITORY } from "./domain/ports/passkey.repository.port";
import { PrismaPasskeyRepository } from "./infrastructure/prisma-passkey.repository";

/**
 * Data module for the `passkey` table. A `*.data.module.ts` is a LEAF: it provides one table's
 * port→adapter binding and imports no other domain — `user` composes this leaf directly.
 */
@Module({
  providers: [{ provide: PASSKEY_REPOSITORY, useClass: PrismaPasskeyRepository }],
  exports: [PASSKEY_REPOSITORY],
})
export class PasskeyDataModule {}
