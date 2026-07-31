import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { installments } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodParamsPipe } from "../../../infra/http/zod-params.pipe";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { CreateInstallmentPlanCommand } from "../application/commands/create-installment-plan.command";
import { PayInstallmentCommand } from "../application/commands/pay-installment.command";
import { RemoveInstallmentPlanCommand } from "../application/commands/remove-installment-plan.command";
import { UnpayInstallmentCommand } from "../application/commands/unpay-installment.command";
import { UpdateInstallmentPlanCommand } from "../application/commands/update-installment-plan.command";
import { GetInstallmentPlanQuery } from "../application/queries/get-installment-plan.query";
import { ListInstallmentPlansQuery } from "../application/queries/list-installment-plans.query";
import { installmentPaymentParamsSchema } from "./dto/installment-payment.params";
import { installmentPlanIdParamsSchema } from "./dto/installment-plan-id.params";

/**
 * Facade (FR-012): translates each HTTP request into a command/query and
 * dispatches it via `CommandBus`/`QueryBus` — never constructs an aggregate,
 * never calls a repository, never contains a business-rule `if`.
 */
@Controller("installments")
@UseGuards(JwtAuthGuard)
export class InstallmentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<installments.InstallmentPlan[]> {
    return this.queryBus.execute(new ListInstallmentPlansQuery(user.id));
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(installmentPlanIdParamsSchema)) params: { id: string },
  ): Promise<installments.InstallmentPlan> {
    return this.queryBus.execute(new GetInstallmentPlanQuery(user.id, params.id));
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(installments.createInstallmentPlanSchema))
    body: installments.CreateInstallmentPlan,
  ): Promise<installments.InstallmentPlan> {
    return this.commandBus.execute(new CreateInstallmentPlanCommand(user.id, body));
  }

  @Post(":id/payments/:seq/pay")
  @HttpCode(204)
  pay(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(installmentPaymentParamsSchema)) params: { id: string; seq: number },
  ): Promise<void> {
    return this.commandBus.execute(new PayInstallmentCommand(user.id, params.id, params.seq));
  }

  @Post(":id/payments/:seq/unpay")
  @HttpCode(204)
  unpay(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(installmentPaymentParamsSchema)) params: { id: string; seq: number },
  ): Promise<void> {
    return this.commandBus.execute(new UnpayInstallmentCommand(user.id, params.id, params.seq));
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(installmentPlanIdParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(installments.updateInstallmentPlanSchema))
    body: installments.UpdateInstallmentPlan,
  ): Promise<installments.InstallmentPlan> {
    return this.commandBus.execute(new UpdateInstallmentPlanCommand(user.id, params.id, body));
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(installmentPlanIdParamsSchema)) params: { id: string },
  ): Promise<void> {
    return this.commandBus.execute(new RemoveInstallmentPlanCommand(user.id, params.id));
  }
}
