import { Module } from "@nestjs/common";

import { InstallmentPlanDataModule } from "../installment-plan/installment-plan.data.module";
import { TransactionDataModule } from "../transaction/transaction.data.module";
import { CREDIT_STATEMENT_REPOSITORY } from "./domain/ports/credit-statement.repository.port";
import { PrismaCreditStatementRepository } from "./infrastructure/prisma-credit-statement.repository";

/** Leaf data module for the `credit-statement` table. A period's live amount is a
 * sum over `transaction`, fetched through that table's own port; its breakdown
 * (spec 014) also composes `installment-plan`'s port for the instalments it
 * billed — same pattern `bank-account`'s leaf already uses for its child tables. */
@Module({
  imports: [TransactionDataModule, InstallmentPlanDataModule],
  providers: [{ provide: CREDIT_STATEMENT_REPOSITORY, useClass: PrismaCreditStatementRepository }],
  exports: [CREDIT_STATEMENT_REPOSITORY],
})
export class CreditStatementDataModule {}
