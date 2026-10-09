import { Injectable, Logger } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Cron, CronExpression } from "@nestjs/schedule";

import { GenerateScheduledStatementsCommand } from "../../domains/credit-statement/application/commands/generate-scheduled-statements.command";

/** Hourly: generates the statements whose scheduled close has arrived. A thin trigger —
 * it only dispatches the command. Editing the dates of the open period never closes it
 * by itself; this is what does, when the day comes. */
@Injectable()
export class StatementGenerationCron {
  private readonly logger = new Logger(StatementGenerationCron.name);

  constructor(private readonly commandBus: CommandBus) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    const generated = await this.commandBus.execute(new GenerateScheduledStatementsCommand());
    if (generated > 0) this.logger.log(`Generated ${generated} scheduled statement(s)`);
  }
}
