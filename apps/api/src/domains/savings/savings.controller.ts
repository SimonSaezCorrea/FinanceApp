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

import { savings } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../infra/http/zod-validation.pipe";
import { SavingsService } from "./savings.service";

@Controller("savings")
@UseGuards(JwtAuthGuard)
export class SavingsController {
  constructor(private readonly service: SavingsService) {}

  @Get("goals")
  list(@CurrentUser() user: AuthUser): Promise<savings.SavingsGoal[]> {
    return this.service.listGoals(user.id);
  }

  @Get("goals/:id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<savings.SavingsGoal> {
    return this.service.getGoal(user.id, id);
  }

  @Post("goals")
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(savings.createSavingsGoalSchema)) body: savings.CreateSavingsGoal,
  ): Promise<savings.SavingsGoal> {
    return this.service.createGoal(user.id, body);
  }

  @Patch("goals/:id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(savings.updateSavingsGoalSchema)) body: savings.UpdateSavingsGoal,
  ): Promise<savings.SavingsGoal> {
    return this.service.updateGoal(user.id, id, body);
  }

  @Delete("goals/:id")
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<void> {
    return this.service.removeGoal(user.id, id);
  }

  @Get("entries")
  listEntries(@CurrentUser() user: AuthUser): Promise<savings.SavingsEntry[]> {
    return this.service.listEntries(user.id);
  }

  @Post("entries")
  createEntry(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(savings.createSavingsEntrySchema)) body: savings.CreateSavingsEntry,
  ): Promise<savings.SavingsEntry> {
    return this.service.createEntry(user.id, body);
  }
}
