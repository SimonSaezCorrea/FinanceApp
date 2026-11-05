import { Module } from "@nestjs/common";

import { MFA_CODE_REPOSITORY } from "./domain/ports/mfa-code.repository.port";
import { PrismaMfaCodeRepository } from "./infrastructure/prisma-mfa-code.repository";

/** Data module for the `mfa-code` table (specs/040). A LEAF, composed by `user` and by the
 * maintenance sweep. */
@Module({
  providers: [{ provide: MFA_CODE_REPOSITORY, useClass: PrismaMfaCodeRepository }],
  exports: [MFA_CODE_REPOSITORY],
})
export class MfaCodeDataModule {}
