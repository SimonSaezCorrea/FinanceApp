import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { AccountsModule } from "../../domains/accounts/accounts.module";
import { BillingGenerationCron } from "./billing-generation.cron";

/**
 * Cross-cutting home for every scheduled automation this app runs — same tier as
 * `infra/prisma`/`infra/auth`/`infra/http`. `ScheduleModule.forRoot()` wires
 * `@nestjs/schedule` once; each `*.cron.ts` file is a thin trigger that calls into
 * the relevant domain's own service (no business logic lives here).
 */
@Module({
  imports: [ScheduleModule.forRoot(), AccountsModule],
  providers: [BillingGenerationCron],
})
export class CronModule {}
