import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import * as contracts from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { ImportTransactionsCommand } from "../application/commands/import-transactions.command";

/**
 * Facade (FR-012): translates the HTTP request into a command and dispatches
 * it via `CommandBus` — never touches the repository/bulk-insert directly.
 */
@Controller("import")
@UseGuards(JwtAuthGuard)
export class ImportController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post("transactions")
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(contracts.imports.importTransactionsRequestSchema))
    body: contracts.imports.ImportTransactionsRequest,
  ): Promise<contracts.imports.ImportResult> {
    return this.commandBus.execute(new ImportTransactionsCommand(user.id, body));
  }
}
