import { Body, Controller, Post, UseGuards } from "@nestjs/common";

import * as contracts from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../infra/http/zod-validation.pipe";
import { ImportService } from "./import.service";

@Controller("import")
@UseGuards(JwtAuthGuard)
export class ImportController {
  constructor(private readonly service: ImportService) {}

  @Post("transactions")
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(contracts.imports.importTransactionsRequestSchema))
    body: contracts.imports.ImportTransactionsRequest,
  ): Promise<contracts.imports.ImportResult> {
    return this.service.importTransactions(user.id, body);
  }
}
