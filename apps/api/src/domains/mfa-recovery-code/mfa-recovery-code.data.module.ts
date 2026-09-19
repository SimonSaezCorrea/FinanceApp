import { Module } from "@nestjs/common";

import { MFA_RECOVERY_CODE_REPOSITORY } from "./domain/ports/mfa-recovery-code.repository.port";
import { PrismaMfaRecoveryCodeRepository } from "./infrastructure/prisma-mfa-recovery-code.repository";

/**
 * Data module for the `mfa-recovery-code` table. A `*.data.module.ts` is a LEAF: it provides one
 * table's port→adapter binding and imports no other domain — `user` composes this leaf directly.
 */
@Module({
  providers: [{ provide: MFA_RECOVERY_CODE_REPOSITORY, useClass: PrismaMfaRecoveryCodeRepository }],
  exports: [MFA_RECOVERY_CODE_REPOSITORY],
})
export class MfaRecoveryCodeDataModule {}
