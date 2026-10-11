import { Module } from "@nestjs/common";

import { EMAIL_TOKEN_REPOSITORY } from "./domain/ports/email-token.repository.port";
import { PrismaEmailTokenRepository } from "./infrastructure/prisma-email-token.repository";

/** Data module for the `email-token` table (specs/032). A LEAF, composed by `user` and by the
 * maintenance cron. */
@Module({
  providers: [{ provide: EMAIL_TOKEN_REPOSITORY, useClass: PrismaEmailTokenRepository }],
  exports: [EMAIL_TOKEN_REPOSITORY],
})
export class EmailTokenDataModule {}
