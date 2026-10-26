import { Module } from "@nestjs/common";

import { MOVEMENT_TEMPLATE_REPOSITORY } from "./domain/ports/movement-template.repository.port";
import { PrismaMovementTemplateRepository } from "./infrastructure/prisma-movement-template.repository";

/**
 * Leaf data module for the `movement-template` table (specs/037): only its
 * port→adapter binding, importing no other domain.
 */
@Module({
  providers: [
    { provide: MOVEMENT_TEMPLATE_REPOSITORY, useClass: PrismaMovementTemplateRepository },
  ],
  exports: [MOVEMENT_TEMPLATE_REPOSITORY],
})
export class MovementTemplateDataModule {}
