import { Module } from "@nestjs/common";

import { CUSTOM_FIELD_REPOSITORY } from "./domain/ports/custom-field.repository.port";
import { PrismaCustomFieldRepository } from "./infrastructure/prisma-custom-field.repository";

/**
 * Leaf data module for the `custom-field` table (specs/036): only its port→adapter
 * binding, importing no other domain — `transaction` (defaults when a movement is
 * created), `bank-account` (an account leaving every scope when deleted) and
 * `import` read the person's fields through it.
 */
@Module({
  providers: [{ provide: CUSTOM_FIELD_REPOSITORY, useClass: PrismaCustomFieldRepository }],
  exports: [CUSTOM_FIELD_REPOSITORY],
})
export class CustomFieldDataModule {}
