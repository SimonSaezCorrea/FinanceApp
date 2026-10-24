import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { customFields, idempotency, rowId } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { requireIdempotencyKey } from "../../../infra/http/idempotency-key";
import { ZodParamsPipe } from "../../../infra/http/zod-params.pipe";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import {
  AssignValuesCommand,
  CreateCustomFieldCommand,
  RemoveCustomFieldCommand,
  RevertAssignmentCommand,
  UpdateCustomFieldCommand,
} from "../application/commands/custom-field.commands";
import {
  CountScopeQuery,
  ListCustomFieldsQuery,
  PreviewAssignmentQuery,
} from "../application/queries/custom-field.queries";

const fieldIdParamsSchema = z.object({ id: rowId });

/**
 * Facade for custom fields (specs/036): request → command/query, never a rule of
 * its own. Literal routes (`scope-count`) are declared before `:id`.
 */
@Controller("custom-fields")
@UseGuards(JwtAuthGuard)
export class CustomFieldsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<customFields.CustomField[]> {
    return this.queryBus.execute(new ListCustomFieldsQuery(user.id));
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(customFields.createCustomFieldSchema))
    body: customFields.CreateCustomField,
  ): Promise<customFields.CustomField> {
    return this.commandBus.execute(new CreateCustomFieldCommand(user.id, body));
  }

  /** How many existing movements a scope covers (FR-005). A read: POST only because
   * the scope travels in the body. */
  @Post("scope-count")
  @HttpCode(200)
  scopeCount(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(customFields.scopeCountRequestSchema))
    body: customFields.ScopeCountRequest,
  ): Promise<{ count: number }> {
    return this.queryBus.execute(new CountScopeQuery(user.id, body.scope));
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(fieldIdParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(customFields.updateCustomFieldSchema))
    body: customFields.UpdateCustomField,
  ): Promise<customFields.CustomField> {
    return this.commandBus.execute(new UpdateCustomFieldCommand(user.id, params.id, body));
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(fieldIdParamsSchema)) params: { id: string },
  ): Promise<void> {
    return this.commandBus.execute(new RemoveCustomFieldCommand(user.id, params.id));
  }

  /** What a bulk assignment would do (FR-016a). A read. */
  @Post(":id/assignments/preview")
  @HttpCode(200)
  previewAssignment(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(fieldIdParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(customFields.assignValuesRequestSchema))
    body: customFields.AssignValuesRequest,
  ): Promise<customFields.AssignmentPreview> {
    return this.queryBus.execute(new PreviewAssignmentQuery(user.id, params.id, body));
  }

  @Post(":id/assignments")
  @HttpCode(200)
  assign(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(fieldIdParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(customFields.assignValuesRequestSchema))
    body: customFields.AssignValuesRequest,
    @Headers(idempotency.IDEMPOTENCY_HEADER) rawIdempotencyKey: unknown,
  ): Promise<customFields.AssignValuesResponse> {
    const idempotencyKey = requireIdempotencyKey(rawIdempotencyKey);
    return this.commandBus.execute(
      new AssignValuesCommand(user.id, idempotencyKey, params.id, body),
    );
  }

  @Post(":id/assignments/revert")
  @HttpCode(200)
  revertAssignment(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(fieldIdParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(customFields.revertAssignmentRequestSchema))
    body: customFields.RevertAssignmentRequest,
  ): Promise<customFields.RevertAssignmentResponse> {
    return this.commandBus.execute(new RevertAssignmentCommand(user.id, params.id, body));
  }
}
