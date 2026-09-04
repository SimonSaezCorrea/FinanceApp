import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { IdempotencyRecordDataModule } from "../idempotency-record/idempotency-record.data.module";
import { SavingsEntryDataModule } from "../savings-entry/savings-entry.data.module";
import { CreateSavingsEntryHandler } from "../savings-entry/application/commands/create-savings-entry.handler";
import { RemoveSavingsEntryHandler } from "../savings-entry/application/commands/remove-savings-entry.handler";
import { UpdateSavingsEntryHandler } from "../savings-entry/application/commands/update-savings-entry.handler";
import { GetSavingsEntryQueryHandler } from "../savings-entry/application/queries/get-savings-entry.handler";
import { ListSavingsEntriesQueryHandler } from "../savings-entry/application/queries/list-savings-entries.handler";
import { CreateSavingsGoalHandler } from "./application/commands/create-savings-goal.handler";
import { RemoveSavingsGoalHandler } from "./application/commands/remove-savings-goal.handler";
import { UpdateSavingsGoalHandler } from "./application/commands/update-savings-goal.handler";
import { GetSavingsGoalQueryHandler } from "./application/queries/get-savings-goal.handler";
import { ListSavingsGoalsQueryHandler } from "./application/queries/list-savings-goals.handler";
import { SAVINGS_GOAL_REPOSITORY } from "./domain/ports/savings-goal.repository.port";
import { PrismaSavingsGoalRepository } from "./infrastructure/prisma-savings-goal.repository";
import { SavingsController } from "./presentation/savings.controller";

const commandHandlers = [
  CreateSavingsGoalHandler,
  UpdateSavingsGoalHandler,
  RemoveSavingsGoalHandler,
  CreateSavingsEntryHandler,
  UpdateSavingsEntryHandler,
  RemoveSavingsEntryHandler,
];

const queryHandlers = [
  ListSavingsGoalsQueryHandler,
  GetSavingsGoalQueryHandler,
  ListSavingsEntriesQueryHandler,
  GetSavingsEntryQueryHandler,
];

/**
 * Orchestration module for the `savings-goal` table. It also hosts the
 * handlers that act on `savings-entry` rows, because the public API exposes
 * them as sub-resources of a goal (`/savings/entries*`) — the entry TABLE is
 * owned by `domains/savings-entry`, imported as a leaf. `savings-entry`'s own
 * handlers additionally compose `savings-goal`'s OWN port directly (not
 * through this module) to verify a `savingsGoalId` belongs to the caller
 * before persisting it.
 */
@Module({
  imports: [
    CqrsModule,
    JwtModule.register({}),
    SavingsEntryDataModule,
    IdempotencyRecordDataModule,
  ],
  controllers: [SavingsController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    { provide: SAVINGS_GOAL_REPOSITORY, useClass: PrismaSavingsGoalRepository },
    JwtAuthGuard,
  ],
})
export class SavingsGoalModule {}
