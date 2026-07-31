import { Injectable, Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { StatementPaidEvent } from "../../domain/events/statement-paid.event";

/**
 * Reference Observer subscriber (User Story 2 / quickstart.md step 3): proves
 * a brand-new reaction to `StatementPaidEvent` can be added with ZERO
 * modifications to `PayCreditStatementHandler` or any file that publishes the
 * event. Synchronous by default (per Clarifications) — a failure here would
 * surface as part of the same request, not swallowed silently.
 */
@Injectable()
@EventsHandler(StatementPaidEvent)
export class LogStatementPaidListener implements IEventHandler<StatementPaidEvent> {
  private readonly logger = new Logger(LogStatementPaidListener.name);

  handle(event: StatementPaidEvent): void {
    this.logger.log(
      `paid: statement ${event.statementId} on account ${event.accountId} — ${event.amount} from ${event.paidFromAccountId}`,
    );
  }
}
