import { Body, Controller, Param, Patch, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";

import { customFields, rowId } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodParamsPipe } from "../../../infra/http/zod-params.pipe";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { SetTransactionValuesCommand } from "../application/commands/custom-field.commands";

const transactionIdParamsSchema = z.object({ id: rowId });

/**
 * Facade for one movement's custom field values (specs/036), under the movement's
 * own URL — same arrangement as `transaction-attachment`. Kept apart from
 * `PATCH /transactions/:id` on purpose: labelling a movement must work even when the
 * movement itself is read-only (FR-012).
 */
@Controller("transactions/:id/custom-fields")
@UseGuards(JwtAuthGuard)
export class TransactionCustomFieldsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Patch()
  set(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(transactionIdParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(customFields.setTransactionValuesRequestSchema))
    body: customFields.SetTransactionValuesRequest,
  ): Promise<{ customFields: Record<string, customFields.CustomFieldValue> }> {
    return this.commandBus.execute(
      new SetTransactionValuesCommand(user.id, params.id, body.values),
    );
  }
}
