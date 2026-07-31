import { Module } from "@nestjs/common";

import { TransactionDataModule } from "../transaction/transaction.data.module";
import { CREDIT_STATEMENT_REPOSITORY } from "./domain/ports/credit-statement.repository.port";
import { PrismaCreditStatementRepository } from "./infrastructure/prisma-credit-statement.repository";

/** Leaf data module for the `credit-statement` table (a period's live amount is
 * a sum over `transaction`, fetched through that table's own port). */
@Module({
  imports: [TransactionDataModule],
  providers: [{ provide: CREDIT_STATEMENT_REPOSITORY, useClass: PrismaCreditStatementRepository }],
  exports: [CREDIT_STATEMENT_REPOSITORY],
})
export class CreditStatementDataModule {}
