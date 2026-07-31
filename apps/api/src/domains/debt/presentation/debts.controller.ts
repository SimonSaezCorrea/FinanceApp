import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { debts } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodParamsPipe } from "../../../infra/http/zod-params.pipe";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { CreateDebtCommand } from "../application/commands/create-debt.command";
import { RegisterDebtPaymentCommand } from "../application/commands/register-debt-payment.command";
import { RemoveDebtCommand } from "../application/commands/remove-debt.command";
import { SettleDebtCommand } from "../application/commands/settle-debt.command";
import { UndoDebtPaymentCommand } from "../application/commands/undo-debt-payment.command";
import { UnsettleDebtCommand } from "../application/commands/unsettle-debt.command";
import { UpdateDebtCommand } from "../application/commands/update-debt.command";
import { GetDebtQuery } from "../application/queries/get-debt.query";
import { ListDebtsQuery } from "../application/queries/list-debts.query";
import { debtIdParamsSchema } from "./dto/debt-id.params";

/**
 * Facade (FR-012): translates each HTTP request into a command/query and
 * dispatches it via `CommandBus`/`QueryBus` — never constructs an aggregate,
 * never calls a repository, never contains a business-rule `if`.
 */
@Controller("debts")
@UseGuards(JwtAuthGuard)
export class DebtsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<debts.Debt[]> {
    return this.queryBus.execute(new ListDebtsQuery(user.id));
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(debtIdParamsSchema)) params: { id: string },
  ): Promise<debts.Debt> {
    return this.queryBus.execute(new GetDebtQuery(user.id, params.id));
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(debts.createDebtSchema)) body: debts.CreateDebt,
  ): Promise<debts.Debt> {
    return this.commandBus.execute(new CreateDebtCommand(user.id, body));
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(debtIdParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(debts.updateDebtSchema)) body: debts.UpdateDebt,
  ): Promise<debts.Debt> {
    return this.commandBus.execute(new UpdateDebtCommand(user.id, params.id, body));
  }

  @Post(":id/settle")
  @HttpCode(204)
  async settle(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(debtIdParamsSchema)) params: { id: string },
  ): Promise<void> {
    await this.commandBus.execute(new SettleDebtCommand(user.id, params.id));
  }

  @Post(":id/unsettle")
  @HttpCode(200)
  unsettle(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(debtIdParamsSchema)) params: { id: string },
  ): Promise<debts.Debt> {
    return this.commandBus.execute(new UnsettleDebtCommand(user.id, params.id));
  }

  @Post(":id/register-payment")
  @HttpCode(200)
  registerPayment(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(debtIdParamsSchema)) params: { id: string },
  ): Promise<debts.Debt> {
    return this.commandBus.execute(new RegisterDebtPaymentCommand(user.id, params.id));
  }

  @Post(":id/undo-payment")
  @HttpCode(200)
  undoPayment(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(debtIdParamsSchema)) params: { id: string },
  ): Promise<debts.Debt> {
    return this.commandBus.execute(new UndoDebtPaymentCommand(user.id, params.id));
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(debtIdParamsSchema)) params: { id: string },
  ): Promise<void> {
    return this.commandBus.execute(new RemoveDebtCommand(user.id, params.id));
  }
}
