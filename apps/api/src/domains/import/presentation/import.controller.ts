import { Body, Controller, Headers, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import * as contracts from "@finance/contracts";
import { idempotency } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { requireIdempotencyKey } from "../../../infra/http/idempotency-key";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { ImportTemplateCommand } from "../application/commands/import-template.command";
import { ImportTransactionsCommand } from "../application/commands/import-transactions.command";
import { PreviewTemplateQuery } from "../application/queries/preview-template.query";

/**
 * Facade (FR-012): translates the HTTP request into a command and dispatches
 * it via `CommandBus` — never touches the repository/bulk-insert directly.
 */
@Controller("import")
@UseGuards(JwtAuthGuard)
export class ImportController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post("transactions")
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(contracts.imports.importTransactionsRequestSchema))
    body: contracts.imports.ImportTransactionsRequest,
    @Headers(idempotency.IDEMPOTENCY_HEADER) rawIdempotencyKey: unknown,
  ): Promise<contracts.imports.ImportResult> {
    // Moves money like any movement does, so it is retry-safe the same way.
    const idempotencyKey = requireIdempotencyKey(rawIdempotencyKey);
    return this.commandBus.execute(new ImportTransactionsCommand(user.id, body, idempotencyKey));
  }

  /** Validates a Cuadra template without writing (specs/027): counts, the effect
   * on each account, and every problem located on its sheet and row. A POST only
   * because the body is large — it changes nothing, so it needs no idempotency key. */
  @Post("template/preview")
  @HttpCode(200)
  previewTemplate(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(contracts.imports.templateImportRequestSchema))
    body: contracts.imports.TemplateImportRequest,
  ): Promise<contracts.imports.TemplatePreviewResponse> {
    return this.queryBus.execute(new PreviewTemplateQuery(user.id, body));
  }

  /** Applies a Cuadra template all-or-nothing. */
  @Post("template")
  importTemplate(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(contracts.imports.templateImportRequestSchema))
    body: contracts.imports.TemplateImportRequest,
    @Headers(idempotency.IDEMPOTENCY_HEADER) rawIdempotencyKey: unknown,
  ): Promise<contracts.imports.TemplateImportResult> {
    const idempotencyKey = requireIdempotencyKey(rawIdempotencyKey);
    return this.commandBus.execute(new ImportTemplateCommand(user.id, body, idempotencyKey));
  }
}
