import { Module } from "@nestjs/common";

import { AUTHENTICATOR_MODEL_REPOSITORY } from "./domain/ports/authenticator-model.repository.port";
import { PrismaAuthenticatorModelRepository } from "./infrastructure/prisma-authenticator-model.repository";

/** Leaf data module for the `authenticator-model` table (specs/041), composed by `user`. */
@Module({
  providers: [
    { provide: AUTHENTICATOR_MODEL_REPOSITORY, useClass: PrismaAuthenticatorModelRepository },
  ],
  exports: [AUTHENTICATOR_MODEL_REPOSITORY],
})
export class AuthenticatorModelDataModule {}
