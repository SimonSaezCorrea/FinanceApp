import { Module } from "@nestjs/common";

import { USER_EMAIL_REPOSITORY } from "./domain/ports/user-email.repository.port";
import { PrismaUserEmailRepository } from "./infrastructure/prisma-user-email.repository";

/**
 * Data module for the `user-email` table (specs/032). A LEAF: it provides one table's port→adapter
 * binding and imports no other domain — `user` composes it, like `passkey` and `session`.
 */
@Module({
  providers: [{ provide: USER_EMAIL_REPOSITORY, useClass: PrismaUserEmailRepository }],
  exports: [USER_EMAIL_REPOSITORY],
})
export class UserEmailDataModule {}
