import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { accounts, idempotency } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { requireIdempotencyKey } from "../../../infra/http/idempotency-key";
import { ZodParamsPipe } from "../../../infra/http/zod-params.pipe";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { accountIdParamsSchema } from "../../bank-account/presentation/dto/account-id.params";
import { GenerateStatementsCommand } from "../application/commands/generate-statements.command";
import { PayCreditStatementCommand } from "../application/commands/pay-credit-statement.command";
import { SyncStatementCommand } from "../application/commands/sync-statement.command";
import { UpdateStatementPaymentCommand } from "../application/commands/update-statement-payment.command";
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
    @Body(new ZodValidationPipe(accounts.payCreditStatementSchema))
    body: accounts.PayCreditStatement,
    @Headers(idempotency.IDEMPOTENCY_HEADER) rawIdempotencyKey: unknown,
  ): Promise<accounts.CreditStatement> {
    const idempotencyKey = requireIdempotencyKey(rawIdempotencyKey);
    return this.commandBus.execute(
      new PayCreditStatementCommand(
        user.id,
        params.id,
        params.statementId,
        body.fromAccountId,
        idempotencyKey,
        body.amount,
        body.paidAt ? new Date(body.paidAt) : undefined,
        body.reference,
      ),
    );
  }

  /** Correct what was PAID on a settled period (not its amount — that is `sync`). */
  @Patch(":id/credit-statements/:statementId/payment")
  updateStatementPayment(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(statementParamsSchema)) params: { id: string; statementId: string },
    @Body(new ZodValidationPipe(accounts.updateStatementPaymentSchema))
    body: accounts.UpdateStatementPayment,
  ): Promise<accounts.CreditStatement> {
    return this.commandBus.execute(
      new UpdateStatementPaymentCommand(user.id, params.id, params.statementId, body.amount),
    );
  }

  /** Reconcile a period against the movements dated inside it (replaces the old
   *  manual amount correction). */
  @Post(":id/credit-statements/:statementId/sync")
  syncCreditStatement(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(statementParamsSchema)) params: { id: string; statementId: string },
  ): Promise<accounts.CreditStatement> {
    return this.commandBus.execute(
      new SyncStatementCommand(user.id, params.id, params.statementId),
    );
  }
}
