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

import { recurring } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../infra/http/zod-validation.pipe";
import { RecurringService } from "./recurring.service";

@Controller("recurring")
@UseGuards(JwtAuthGuard)
export class RecurringController {
  constructor(private readonly service: RecurringService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<recurring.RecurringExpense[]> {
    return this.service.list(user.id);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<recurring.RecurringExpense> {
    return this.service.get(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(recurring.createRecurringExpenseSchema))
    body: recurring.CreateRecurringExpense,
  ): Promise<recurring.RecurringExpense> {
    return this.service.create(user.id, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(recurring.updateRecurringExpenseSchema))
    body: recurring.UpdateRecurringExpense,
  ): Promise<recurring.RecurringExpense> {
    return this.service.update(user.id, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<void> {
    return this.service.remove(user.id, id);
  }
}
