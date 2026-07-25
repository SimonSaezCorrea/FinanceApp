import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { AddCardHandler } from "./application/commands/add-card.handler";
import { CorrectStatementAmountHandler } from "./application/commands/correct-statement-amount.handler";
import { CreateAccountHandler } from "./application/commands/create-account.handler";
import { GenerateAllDueStatementsHandler, GenerateStatementsHandler } from "./application/commands/generate-statements.handler";
import { PayCreditStatementHandler } from "./application/commands/pay-credit-statement.handler";
import { ReconcileAccountHandler } from "./application/commands/reconcile-account.handler";
import { RemoveAccountHandler } from "./application/commands/remove-account.handler";
import { RemoveCardHandler } from "./application/commands/remove-card.handler";
import { SetAccountStatusHandler } from "./application/commands/set-account-status.handler";
import { UpdateAccountHandler } from "./application/commands/update-account.handler";
import { UpdateCardHandler } from "./application/commands/update-card.handler";
import { LogStatementPaidListener } from "./application/events/log-statement-paid.listener";
import { GetAccountQueryHandler } from "./application/queries/get-account.handler";
import { ListAccountsQueryHandler } from "./application/queries/list-accounts.handler";
import { ListCreditStatementsQueryHandler } from "./application/queries/list-credit-statements.handler";
import { BANK_ACCOUNT_REPOSITORY } from "./domain/ports/bank-account.repository.port";
import { CREDIT_STATEMENT_REPOSITORY } from "./domain/ports/credit-statement.repository.port";
import { PrismaBankAccountRepository } from "./infrastructure/prisma-bank-account.repository";
import { PrismaCreditStatementRepository } from "./infrastructure/prisma-credit-statement.repository";
import { AccountsController } from "./presentation/accounts.controller";

const commandHandlers = [
  CreateAccountHandler,
  UpdateAccountHandler,
  SetAccountStatusHandler,
  ReconcileAccountHandler,
  RemoveAccountHandler,
  AddCardHandler,
  UpdateCardHandler,
  RemoveCardHandler,
  PayCreditStatementHandler,
  GenerateStatementsHandler,
  GenerateAllDueStatementsHandler,
  CorrectStatementAmountHandler,
];

const queryHandlers = [ListAccountsQueryHandler, GetAccountQueryHandler, ListCreditStatementsQueryHandler];

const eventHandlers = [LogStatementPaidListener];

@Module({
  imports: [CqrsModule, JwtModule.register({})],
  controllers: [AccountsController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    ...eventHandlers,
    { provide: BANK_ACCOUNT_REPOSITORY, useClass: PrismaBankAccountRepository },
    { provide: CREDIT_STATEMENT_REPOSITORY, useClass: PrismaCreditStatementRepository },
    JwtAuthGuard,
  ],
  // GenerateAllDueStatementsHandler is invoked by src/infra/cron (daily job) via
  // CommandBus.execute(new GenerateAllDueStatementsCommand()) — same code path as
  // the manual "Generar facturación" button, no duplicated rules.
  exports: [],
})
export class AccountsModule {}
