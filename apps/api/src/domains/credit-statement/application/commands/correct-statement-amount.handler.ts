import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import type { CreditStatement } from "../../domain/credit-statement.aggregate";
import { StatementNotFoundError } from "../../domain/errors";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../domain/ports/credit-statement.repository.port";
import { CorrectStatementAmountCommand } from "./correct-statement-amount.command";

export interface CorrectedStatementResult {
  id: string;
  accountId: string;
  status: "OPEN" | "PENDING" | "PAID";
  periodStart: string;
  closedAt: string | null;
  paidAt: string | null;
  amount: string;
  paidFromAccountId: string | null;
  paidTransactionId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Manually correct a PAID statement's frozen amount — rejected for
 * OPEN/PENDING ones by the aggregate's own State (`StatementNotPaidError`). */
@Injectable()
@CommandHandler(CorrectStatementAmountCommand)
export class CorrectStatementAmountHandler extends BaseCommandHandler<
  CorrectStatementAmountCommand,
  CorrectedStatementResult,
  CreditStatement
> {
  constructor(
    eventBus: EventBus,
    @Inject(CREDIT_STATEMENT_REPOSITORY)
    private readonly statementRepo: CreditStatementRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: CorrectStatementAmountCommand): Promise<CreditStatement> {
    const statement = await this.statementRepo.findById(
      command.userId,
      command.accountId,
      command.statementId,
    );
    if (!statement) throw new StatementNotFoundError();
    return statement;
  }

  protected async handle(
    command: CorrectStatementAmountCommand,
    statement: CreditStatement,
  ): Promise<HandleResult<CorrectedStatementResult>> {
    statement.correctAmount(command.amount);
    return {
      result: {
        id: statement.id,
        accountId: statement.accountId,
        status: statement.state.name,
        periodStart: statement.periodStart.toISOString(),
        closedAt: statement.closedAt?.toISOString() ?? null,
        paidAt: statement.paidAt?.toISOString() ?? null,
        amount: statement.amount,
        paidFromAccountId: statement.paidFromAccountId,
        paidTransactionId: statement.paidTransactionId,
        createdAt: statement.createdAt.toISOString(),
        updatedAt: statement.updatedAt.toISOString(),
      },
      events: [],
    };
  }

  protected override async persist(statement: CreditStatement): Promise<void> {
    await this.statementRepo.save(statement);
  }
}
