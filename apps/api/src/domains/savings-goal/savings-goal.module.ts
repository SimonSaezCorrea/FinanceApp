import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { BankAccountDataModule } from "../bank-account/bank-account.data.module";
import { IdempotencyRecordDataModule } from "../idempotency-record/idempotency-record.data.module";
import { TransactionDataModule } from "../transaction/transaction.data.module";
import { SavingsEntryDataModule } from "../savings-entry/savings-entry.data.module";
import { CreateSavingsEntryHandler } from "../savings-entry/application/commands/create-savings-entry.handler";
import { RemoveSavingsEntryHandler } from "../savings-entry/application/commands/remove-savings-entry.handler";
import { UpdateSavingsEntryHandler } from "../savings-entry/application/commands/update-savings-entry.handler";
import { GetSavingsEntryQueryHandler } from "../savings-entry/application/queries/get-savings-entry.handler";
import { ListSavingsEntriesQueryHandler } from "../savings-entry/application/queries/list-savings-entries.handler";
import { CloseSavingsGoalHandler } from "./application/commands/close-savings-goal.handler";
import { CreateSavingsGoalHandler } from "./application/commands/create-savings-goal.handler";
import { ReopenSavingsGoalHandler } from "./application/commands/reopen-savings-goal.handler";
import { RemoveSavingsGoalHandler } from "./application/commands/remove-savings-goal.handler";
import { UpdateSavingsGoalHandler } from "./application/commands/update-savings-goal.handler";
import { GetSavingsGoalQueryHandler } from "./application/queries/get-savings-goal.handler";
import { GetSavingsSummaryQueryHandler } from "./application/queries/get-savings-summary.handler";
import { ListSavingsGoalsQueryHandler } from "./application/queries/list-savings-goals.handler";
import { SavingsGoalDataModule } from "./savings-goal.data.module";
import { SavingsController } from "./presentation/savings.controller";

const commandHandlers = [
  CreateSavingsGoalHandler,
  UpdateSavingsGoalHandler,
  RemoveSavingsGoalHandler,
  CloseSavingsGoalHandler,
  ReopenSavingsGoalHandler,
  CreateSavingsEntryHandler,
  UpdateSavingsEntryHandler,
  RemoveSavingsEntryHandler,
];

const queryHandlers = [
  ListSavingsGoalsQueryHandler,
  GetSavingsGoalQueryHandler,
  GetSavingsSummaryQueryHandler,
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
 * before persisting it. `BankAccountDataModule`/`TransactionDataModule` are
 * needed for real money movement (contributing, and closing with
 * "retirar a cuenta") — see research.md §7.
 */
@Module({
  imports: [
    CqrsModule,
    JwtModule.register({}),
    SavingsGoalDataModule,
    SavingsEntryDataModule,
    IdempotencyRecordDataModule,
    BankAccountDataModule,
    TransactionDataModule,
  ],
  controllers: [SavingsController],
  providers: [...commandHandlers, ...queryHandlers, JwtAuthGuard],
})
export class SavingsGoalModule {}
