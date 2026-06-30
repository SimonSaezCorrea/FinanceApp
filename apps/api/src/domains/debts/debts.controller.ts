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

import { debts } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../infra/http/zod-validation.pipe";
import { DebtsService } from "./debts.service";

@Controller("debts")
@UseGuards(JwtAuthGuard)
export class DebtsController {
  constructor(private readonly service: DebtsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<debts.Debt[]> {
    return this.service.list(user.id);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<debts.Debt> {
    return this.service.get(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(debts.createDebtSchema)) body: debts.CreateDebt,
  ): Promise<debts.Debt> {
    return this.service.create(user.id, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(debts.updateDebtSchema)) body: debts.UpdateDebt,
  ): Promise<debts.Debt> {
    return this.service.update(user.id, id, body);
  }

  @Post(":id/settle")
  @HttpCode(204)
  async settle(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<void> {
    await this.service.settle(user.id, id);
  }

  @Post(":id/unsettle")
  unsettle(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<debts.Debt> {
    return this.service.unsettle(user.id, id);
  }

  @Post(":id/register-payment")
  registerPayment(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<debts.Debt> {
    return this.service.registerPayment(user.id, id);
  }

  @Post(":id/undo-payment")
  undoPayment(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<debts.Debt> {
    return this.service.undoPayment(user.id, id);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<void> {
    return this.service.remove(user.id, id);
  }
}
