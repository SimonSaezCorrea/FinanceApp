import { Module } from "@nestjs/common";

import { InstallmentPlanDataModule } from "../installment-plan/installment-plan.data.module";
import { TransactionDataModule } from "../transaction/transaction.data.module";
import { CREDIT_STATEMENT_LOOKUP } from "./domain/ports/credit-statement-lookup.port";
import { CREDIT_STATEMENT_REPOSITORY } from "./domain/ports/credit-statement.repository.port";
import { PrismaCreditStatementRepository } from "./infrastructure/prisma-credit-statement.repository";

/** Leaf data module for the `credit-statement` table. A period's live amount is a
 * sum over `transaction`, fetched through that table's own port; its breakdown
 * (spec 014) also composes `installment-plan`'s port for the instalments it
 * billed — same pattern `bank-account`'s leaf already uses for its child tables.
 * Also exports a read-only lookup, over the same adapter, for `transaction` —
 * which needs to resolve "which statement did this movement pay" for its own
 * detail view without ever querying this table itself. */
@Module({
  imports: [TransactionDataModule, InstallmentPlanDataModule],
  providers: [
    { provide: CREDIT_STATEMENT_REPOSITORY, useClass: PrismaCreditStatementRepository },
    { provide: CREDIT_STATEMENT_LOOKUP, useClass: PrismaCreditStatementRepository },
  ],
  exports: [CREDIT_STATEMENT_REPOSITORY, CREDIT_STATEMENT_LOOKUP],
})
export class CreditStatementDataModule {}
