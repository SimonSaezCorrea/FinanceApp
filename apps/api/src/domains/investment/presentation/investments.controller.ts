import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { investments } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodParamsPipe } from "../../../infra/http/zod-params.pipe";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { CreateInvestmentCommand } from "../application/commands/create-investment.command";
import { RemoveInvestmentCommand } from "../application/commands/remove-investment.command";
import { UpdateInvestmentCommand } from "../application/commands/update-investment.command";
import { GetInvestmentQuery } from "../application/queries/get-investment.query";
import { ListInvestmentsQuery } from "../application/queries/list-investments.query";
import { investmentIdParamsSchema } from "./dto/investment-id.params";

/**
 * Facade (FR-012): translates each HTTP request into a command/query and
 * dispatches it via `CommandBus`/`QueryBus` — never constructs an aggregate,
 * never calls a repository, never contains a business-rule `if`.
 */
@Controller("investments")
@UseGuards(JwtAuthGuard)
export class InvestmentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<investments.Investment[]> {
    return this.queryBus.execute(new ListInvestmentsQuery(user.id));
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(investmentIdParamsSchema)) params: { id: string },
  ): Promise<investments.Investment> {
    return this.queryBus.execute(new GetInvestmentQuery(user.id, params.id));
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(investments.createInvestmentSchema))
    body: investments.CreateInvestment,
  ): Promise<investments.Investment> {
    return this.commandBus.execute(new CreateInvestmentCommand(user.id, body));
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(investmentIdParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(investments.updateInvestmentSchema))
    body: investments.UpdateInvestment,
  ): Promise<investments.Investment> {
    return this.commandBus.execute(new UpdateInvestmentCommand(user.id, params.id, body));
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(investmentIdParamsSchema)) params: { id: string },
  ): Promise<void> {
    return this.commandBus.execute(new RemoveInvestmentCommand(user.id, params.id));
  }
}
