import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { ScheduleModule } from "@nestjs/schedule";

import { CreditStatementModule } from "../../domains/credit-statement/credit-statement.module";
import { IdempotencyRecordModule } from "../../domains/idempotency-record/idempotency-record.module";
import { BillingGenerationCron } from "./billing-generation.cron";
import { IdempotencyCleanupCron } from "./idempotency-cleanup.cron";

/**
 * Cross-cutting home for every scheduled automation this app runs — same tier as
 * `infra/prisma`/`infra/auth`/`infra/http`. `ScheduleModule.forRoot()` wires
 * `@nestjs/schedule` once; each `*.cron.ts` file is a thin trigger that dispatches
 * a command via `CommandBus` into the relevant domain's own handler (no business
 * logic lives here). `CqrsModule` is imported directly (a static class reference,
 * not a dynamic `forRoot()` module) so it resolves to the SAME singleton instance
 * `CreditStatementModule` already registers, sharing one `CommandBus`.
 */
@Module({
  imports: [ScheduleModule.forRoot(), CqrsModule, CreditStatementModule, IdempotencyRecordModule],
  providers: [BillingGenerationCron, IdempotencyCleanupCron],
})
export class CronModule {}
