import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { BankAccountDataModule } from "../bank-account/bank-account.data.module";
import { TransactionDataModule } from "../transaction/transaction.data.module";
import { SyncStatementHandler } from "./application/commands/sync-statement.handler";
import { UpdateStatementPaymentHandler } from "./application/commands/update-statement-payment.handler";
import {
  GenerateAllDueStatementsHandler,
  GenerateStatementsHandler,
} from "./application/commands/generate-statements.handler";
import { PayCreditStatementHandler } from "./application/commands/pay-credit-statement.handler";
import { LogStatementPaidListener } from "./application/events/log-statement-paid.listener";
import { ListCreditStatementsQueryHandler } from "./application/queries/list-credit-statements.handler";
import { CreditStatementDataModule } from "./credit-statement.data.module";
import { CreditStatementsController } from "./presentation/credit-statements.controller";

const commandHandlers = [
  PayCreditStatementHandler,
  GenerateStatementsHandler,
  GenerateAllDueStatementsHandler,
  SyncStatementHandler,
  UpdateStatementPaymentHandler,
];

/**
 * Orchestration module for the `credit-statement` table: billing periods, their
 * generation and payment. Depends on `bank-account`'s DATA module (it must load
 * and adjust the account's credit pool) — never on its orchestration module, so
 * the graph stays acyclic.
 *
 * `GenerateAllDueStatementsHandler` is invoked by `src/infra/cron` (daily job)
 * via `CommandBus.execute(new GenerateAllDueStatementsCommand())` — the same code
 * path as the manual "Generar facturación" button, no duplicated rules.
 */
@Module({
  imports: [
    CqrsModule,
    JwtModule.register({}),
    CreditStatementDataModule,
    BankAccountDataModule,
    TransactionDataModule,
  ],
  controllers: [CreditStatementsController],
  providers: [
    ...commandHandlers,
    ListCreditStatementsQueryHandler,
    LogStatementPaidListener,
    JwtAuthGuard,
  ],
})
export class CreditStatementModule {}
