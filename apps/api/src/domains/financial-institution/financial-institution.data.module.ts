import { Module } from "@nestjs/common";

import { FINANCIAL_INSTITUTION_LOOKUP } from "./domain/ports/financial-institution-lookup.port";
import { PrismaFinancialInstitutionLookupRepository } from "./infrastructure/prisma-financial-institution-lookup.repository";

/** Leaf data module for the `financial-institution` table. */
@Module({
  providers: [{ provide: FINANCIAL_INSTITUTION_LOOKUP, useClass: PrismaFinancialInstitutionLookupRepository }],
  exports: [FINANCIAL_INSTITUTION_LOOKUP],
})
export class FinancialInstitutionDataModule {}
