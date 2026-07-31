import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { accounts } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodParamsPipe } from "../../../infra/http/zod-params.pipe";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { accountIdParamsSchema } from "../../bank-account/presentation/dto/account-id.params";
import { CorrectStatementAmountCommand } from "../application/commands/correct-statement-amount.command";
import { GenerateStatementsCommand } from "../application/commands/generate-statements.command";
import { PayCreditStatementCommand } from "../application/commands/pay-credit-statement.command";
import { ListCreditStatementsQuery } from "../application/queries/list-credit-statements.query";
import { statementParamsSchema } from "./dto/statement.params";

/**
 * Facade (FR-012) for the `credit-statement` table. Nested under `/accounts` so
 * the public URLs are byte-identical to before the one-table-one-domain split
 * (no contract change) — the routes simply moved to the domain that owns the
 * table they act on.
 */
@Controller("accounts")
@UseGuards(JwtAuthGuard)
export class CreditStatementsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post(":id/generate-statements")
  async generateStatements(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(accountIdParamsSchema)) params: { id: string },
  ): Promise<accounts.CreditStatement[]> {
    await this.commandBus.execute(new GenerateStatementsCommand(user.id, params.id));
    return this.queryBus.execute(new ListCreditStatementsQuery(user.id, params.id));
  }

  @Get(":id/credit-statements")
  listCreditStatements(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(accountIdParamsSchema)) params: { id: string },
  ): Promise<accounts.CreditStatement[]> {
    return this.queryBus.execute(new ListCreditStatementsQuery(user.id, params.id));
  }

  @Post(":id/credit-statements/:statementId/pay")
  payCreditStatement(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(statementParamsSchema)) params: { id: string; statementId: string },
    @Body(new ZodValidationPipe(accounts.payCreditStatementSchema)) body: accounts.PayCreditStatement,
  ): Promise<accounts.CreditStatement> {
    return this.commandBus.execute(
      new PayCreditStatementCommand(user.id, params.id, params.statementId, body.fromAccountId),
    );
  }

  @Patch(":id/credit-statements/:statementId")
  updateCreditStatement(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(statementParamsSchema)) params: { id: string; statementId: string },
    @Body(new ZodValidationPipe(accounts.updateCreditStatementSchema)) body: accounts.UpdateCreditStatement,
  ): Promise<accounts.CreditStatement> {
    return this.commandBus.execute(
      new CorrectStatementAmountCommand(user.id, params.id, params.statementId, body.amount),
    );
  }
}
