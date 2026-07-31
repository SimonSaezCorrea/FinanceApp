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

import { recurring } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodParamsPipe } from "../../../infra/http/zod-params.pipe";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { CreateRecurringExpenseCommand } from "../application/commands/create-recurring-expense.command";
import { RemoveRecurringExpenseCommand } from "../application/commands/remove-recurring-expense.command";
import { UpdateRecurringExpenseCommand } from "../application/commands/update-recurring-expense.command";
import { GetRecurringExpenseQuery } from "../application/queries/get-recurring-expense.query";
import { ListRecurringExpensesQuery } from "../application/queries/list-recurring-expenses.query";
import { recurringIdParamsSchema } from "./dto/recurring-id.params";

/**
 * Facade (FR-012): translates each HTTP request into a command/query and
 * dispatches it via `CommandBus`/`QueryBus` — never constructs an aggregate,
 * never calls a repository, never contains a business-rule `if`.
 */
@Controller("recurring")
@UseGuards(JwtAuthGuard)
export class RecurringController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<recurring.RecurringExpense[]> {
    return this.queryBus.execute(new ListRecurringExpensesQuery(user.id));
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(recurringIdParamsSchema)) params: { id: string },
  ): Promise<recurring.RecurringExpense> {
    return this.queryBus.execute(new GetRecurringExpenseQuery(user.id, params.id));
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(recurring.createRecurringExpenseSchema))
    body: recurring.CreateRecurringExpense,
  ): Promise<recurring.RecurringExpense> {
    return this.commandBus.execute(new CreateRecurringExpenseCommand(user.id, body));
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(recurringIdParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(recurring.updateRecurringExpenseSchema))
    body: recurring.UpdateRecurringExpense,
  ): Promise<recurring.RecurringExpense> {
    return this.commandBus.execute(new UpdateRecurringExpenseCommand(user.id, params.id, body));
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(recurringIdParamsSchema)) params: { id: string },
  ): Promise<void> {
    return this.commandBus.execute(new RemoveRecurringExpenseCommand(user.id, params.id));
  }
}
