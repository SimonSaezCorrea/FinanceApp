import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { BillingGenerationService } from "../../domains/accounts/billing-generation.service";

/** Daily trigger for closing due credit-pool billing periods — same rules as the
 * manual "Generar facturación" button (`AccountsController.generateStatements`),
 * via the shared `BillingGenerationService`. */
@Injectable()
export class BillingGenerationCron {
  private readonly logger = new Logger(BillingGenerationCron.name);

  constructor(private readonly billing: BillingGenerationService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<void> {
    this.logger.log("Running scheduled billing-statement generation");
    await this.billing.generateForAllDueAccounts();
  }
}
