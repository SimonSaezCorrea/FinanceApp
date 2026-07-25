import { Injectable, Logger } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Cron, CronExpression } from "@nestjs/schedule";

import { GenerateAllDueStatementsCommand } from "../../domains/accounts/application/commands/generate-statements.command";

/** Daily trigger for closing due credit-pool billing periods — same rules as the
 * manual "Generar facturación" button (`AccountsController.generateStatements`),
 * via the shared `GenerateStatementsHandler`/`GenerateAllDueStatementsHandler`
 * (both port over the same `closeIfDue` logic). */
@Injectable()
export class BillingGenerationCron {
  private readonly logger = new Logger(BillingGenerationCron.name);

  constructor(private readonly commandBus: CommandBus) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<void> {
    this.logger.log("Running scheduled billing-statement generation");
    await this.commandBus.execute(new GenerateAllDueStatementsCommand());
  }
}
