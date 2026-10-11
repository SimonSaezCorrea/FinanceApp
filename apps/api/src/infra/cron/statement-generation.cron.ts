import { Injectable, Logger } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Cron } from "@nestjs/schedule";

import { CronSwitch } from "../config/cron.config";
import { GenerateScheduledStatementsCommand } from "../../domains/credit-statement/application/commands/generate-scheduled-statements.command";

/** Daily at 00:00 Chile time: generates the statements whose scheduled close has arrived. A
 * scheduled close is the END of its day in the user's zone, so midnight is the first moment it is
 * due. A thin trigger — it only dispatches the command. Editing the dates of the open period never
 * closes it by itself; this is what does, when the day comes ("Generar facturación" still closes
 * it at any time by hand). Hourly until 2026-10-10. */
@Injectable()
export class StatementGenerationCron {
  private readonly logger = new Logger(StatementGenerationCron.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly crons: CronSwitch,
  ) {}

  @Cron("0 0 * * *", { timeZone: "America/Santiago" })
  async run(): Promise<void> {
    if (!this.crons.enabled) return;
    const generated = await this.commandBus.execute(new GenerateScheduledStatementsCommand());
    if (generated > 0) this.logger.log(`Generated ${generated} scheduled statement(s)`);
  }
}
