import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { CreateSavingsEntryHandler } from "./application/commands/create-savings-entry.handler";
import { CreateSavingsGoalHandler } from "./application/commands/create-savings-goal.handler";
import { RemoveSavingsGoalHandler } from "./application/commands/remove-savings-goal.handler";
import { UpdateSavingsGoalHandler } from "./application/commands/update-savings-goal.handler";
import { GetSavingsGoalQueryHandler } from "./application/queries/get-savings-goal.handler";
import { ListSavingsEntriesQueryHandler } from "./application/queries/list-savings-entries.handler";
import { ListSavingsGoalsQueryHandler } from "./application/queries/list-savings-goals.handler";
import { SAVINGS_ENTRY_REPOSITORY } from "./domain/ports/savings-entry.repository.port";
import { SAVINGS_GOAL_REPOSITORY } from "./domain/ports/savings-goal.repository.port";
import { PrismaSavingsEntryRepository } from "./infrastructure/prisma-savings-entry.repository";
import { PrismaSavingsGoalRepository } from "./infrastructure/prisma-savings-goal.repository";
import { SavingsController } from "./presentation/savings.controller";

const commandHandlers = [
  CreateSavingsGoalHandler,
  UpdateSavingsGoalHandler,
  RemoveSavingsGoalHandler,
  CreateSavingsEntryHandler,
];

const queryHandlers = [ListSavingsGoalsQueryHandler, GetSavingsGoalQueryHandler, ListSavingsEntriesQueryHandler];

@Module({
  imports: [CqrsModule, JwtModule.register({})],
  controllers: [SavingsController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    { provide: SAVINGS_GOAL_REPOSITORY, useClass: PrismaSavingsGoalRepository },
    { provide: SAVINGS_ENTRY_REPOSITORY, useClass: PrismaSavingsEntryRepository },
    JwtAuthGuard,
  ],
  exports: [],
})
export class SavingsModule {}
