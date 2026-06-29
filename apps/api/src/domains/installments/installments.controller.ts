import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { installments } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../infra/http/zod-validation.pipe";
import { InstallmentsService } from "./installments.service";

@Controller("installments")
@UseGuards(JwtAuthGuard)
export class InstallmentsController {
  constructor(private readonly service: InstallmentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<installments.InstallmentPlan[]> {
    return this.service.list(user.id);
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ): Promise<installments.InstallmentPlan> {
    return this.service.get(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(installments.createInstallmentPlanSchema))
    body: installments.CreateInstallmentPlan,
  ): Promise<installments.InstallmentPlan> {
    return this.service.create(user.id, body);
  }

  @Post(":id/payments/:seq/pay")
  @HttpCode(204)
  pay(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("seq", ParseIntPipe) seq: number,
  ): Promise<void> {
    return this.service.pay(user.id, id, seq);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(installments.updateInstallmentPlanSchema))
    body: installments.UpdateInstallmentPlan,
  ): Promise<installments.InstallmentPlan> {
    return this.service.update(user.id, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<void> {
    return this.service.remove(user.id, id);
  }
}
