import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { ListInstitutionsQueryHandler } from "./application/queries/list-institutions.handler";
import { INSTITUTION_REPOSITORY } from "./domain/ports/institution.repository.port";
import { PrismaInstitutionRepository } from "./infrastructure/prisma-institution.repository";
import { InstitutionsController } from "./presentation/institutions.controller";

/**
 * Orchestration module for the `financial-institution` table (the catalogue
 * behind `GET /institutions`). Global, read-only, seeded.
 * `financial-institution.data.module.ts` is the separate name-lookup leaf that
 * `bank-account` composes.
 */
@Module({
  imports: [CqrsModule, JwtModule.register({})],
  controllers: [InstitutionsController],
  providers: [
    ListInstitutionsQueryHandler,
    { provide: INSTITUTION_REPOSITORY, useClass: PrismaInstitutionRepository },
    JwtAuthGuard,
  ],
})
export class FinancialInstitutionModule {}
