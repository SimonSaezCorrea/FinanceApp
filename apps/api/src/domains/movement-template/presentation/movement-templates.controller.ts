import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { movementTemplates, rowId } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodParamsPipe } from "../../../infra/http/zod-params.pipe";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import {
  CreateMovementTemplateCommand,
  RemoveMovementTemplateCommand,
  ReplaceMovementTemplateCommand,
} from "../application/commands/movement-template.commands";
import { ListMovementTemplatesQuery } from "../application/queries/movement-template.queries";

const templateIdParamsSchema = z.object({ id: rowId });

/**
 * Facade for movement templates (specs/037): request → command/query, never a rule of
 * its own. Using a template creates nothing here — the web pre-fills the movement form
 * and saves it with `POST /transactions`.
 */
@Controller("movement-templates")
@UseGuards(JwtAuthGuard)
export class MovementTemplatesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<movementTemplates.MovementTemplate[]> {
    return this.queryBus.execute(new ListMovementTemplatesQuery(user.id));
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(movementTemplates.saveMovementTemplateSchema))
    body: movementTemplates.SaveMovementTemplate,
  ): Promise<movementTemplates.MovementTemplate> {
    return this.commandBus.execute(new CreateMovementTemplateCommand(user.id, body));
  }

  @Put(":id")
  replace(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(templateIdParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(movementTemplates.saveMovementTemplateSchema))
    body: movementTemplates.SaveMovementTemplate,
  ): Promise<movementTemplates.MovementTemplate> {
    return this.commandBus.execute(new ReplaceMovementTemplateCommand(user.id, params.id, body));
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(templateIdParamsSchema)) params: { id: string },
  ): Promise<void> {
    return this.commandBus.execute(new RemoveMovementTemplateCommand(user.id, params.id));
  }
}
