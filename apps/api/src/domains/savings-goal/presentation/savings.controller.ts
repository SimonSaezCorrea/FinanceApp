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

import { savings } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodParamsPipe } from "../../../infra/http/zod-params.pipe";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { CreateSavingsEntryCommand } from "../../savings-entry/application/commands/create-savings-entry.command";
import { CreateSavingsGoalCommand } from "../application/commands/create-savings-goal.command";
import { RemoveSavingsGoalCommand } from "../application/commands/remove-savings-goal.command";
import { UpdateSavingsGoalCommand } from "../application/commands/update-savings-goal.command";
import { GetSavingsGoalQuery } from "../application/queries/get-savings-goal.query";
import { ListSavingsEntriesQuery } from "../../savings-entry/application/queries/list-savings-entries.query";
import { ListSavingsGoalsQuery } from "../application/queries/list-savings-goals.query";
import { savingsGoalIdParamsSchema } from "./dto/savings-goal-id.params";

/**
 * Facade (FR-012): translates each HTTP request into a command/query and
 * dispatches it via `CommandBus`/`QueryBus` — never constructs an aggregate,
 * never calls a repository, never contains a business-rule `if`.
 */
@Controller("savings")
@UseGuards(JwtAuthGuard)
export class SavingsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get("goals")
  list(@CurrentUser() user: AuthUser): Promise<savings.SavingsGoal[]> {
    return this.queryBus.execute(new ListSavingsGoalsQuery(user.id));
  }

  @Get("goals/:id")
  get(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(savingsGoalIdParamsSchema)) params: { id: string },
  ): Promise<savings.SavingsGoal> {
    return this.queryBus.execute(new GetSavingsGoalQuery(user.id, params.id));
  }

  @Post("goals")
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(savings.createSavingsGoalSchema)) body: savings.CreateSavingsGoal,
  ): Promise<savings.SavingsGoal> {
    return this.commandBus.execute(new CreateSavingsGoalCommand(user.id, body));
  }

  @Patch("goals/:id")
  update(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(savingsGoalIdParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(savings.updateSavingsGoalSchema)) body: savings.UpdateSavingsGoal,
  ): Promise<savings.SavingsGoal> {
    return this.commandBus.execute(new UpdateSavingsGoalCommand(user.id, params.id, body));
  }

  @Delete("goals/:id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(savingsGoalIdParamsSchema)) params: { id: string },
  ): Promise<void> {
    return this.commandBus.execute(new RemoveSavingsGoalCommand(user.id, params.id));
  }

  @Get("entries")
  listEntries(@CurrentUser() user: AuthUser): Promise<savings.SavingsEntry[]> {
    return this.queryBus.execute(new ListSavingsEntriesQuery(user.id));
  }

  @Post("entries")
  createEntry(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(savings.createSavingsEntrySchema)) body: savings.CreateSavingsEntry,
  ): Promise<savings.SavingsEntry> {
    return this.commandBus.execute(new CreateSavingsEntryCommand(user.id, body));
  }
}
