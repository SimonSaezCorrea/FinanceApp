import { Module } from "@nestjs/common";

import { INSTITUTION_ACCOUNT_TYPE_REPOSITORY } from "./domain/ports/institution-account-type.repository.port";
import { PrismaInstitutionAccountTypeRepository } from "./infrastructure/prisma-institution-account-type.repository";

/** Leaf data module for the `institution-account-type` join table. */
@Module({
  providers: [
    {
      provide: INSTITUTION_ACCOUNT_TYPE_REPOSITORY,
      useClass: PrismaInstitutionAccountTypeRepository,
    },
  ],
  exports: [INSTITUTION_ACCOUNT_TYPE_REPOSITORY],
})
export class InstitutionAccountTypeDataModule {}
