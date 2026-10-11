import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { AccountSecurityEvent } from "../../domain/events/account-security.event";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { AccountEmailService } from "../account-emails";

/**
 * Observer (specs/032 US3): turns an `AccountSecurityEvent` into a notice email, only to a
 * CONFIRMED address (FR-023), in the account's language. Events are dispatched synchronously,
 * so this listener protects itself: the email goes out in the background and any failure is
 * logged — the action that published the event already committed and must never fail
 * because of a notice (FR-006).
 */
@Injectable()
@EventsHandler(AccountSecurityEvent)
export class SendSecurityNoticeListener implements IEventHandler<AccountSecurityEvent> {
  private readonly logger = new Logger(SendSecurityNoticeListener.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    private readonly emails: AccountEmailService,
  ) {}

  handle(event: AccountSecurityEvent): void {
    void this.notify(event).catch((err: unknown) =>
      this.logger.error(`Security notice ${event.kind} failed: ${String(err)}`),
    );
  }

  /** Exposed for tests: the same work `handle` starts in the background. */
  async notify(event: AccountSecurityEvent): Promise<void> {
    const target = await this.recipientFor(event);
    if (!target) return;
    await this.emails.sendSecurityNotice({
      to: target.address,
      locale: target.locale,
      kind: event.kind,
      occurredAt: event.occurredAt,
      detail: event.detail,
    });
  }

  private async recipientFor(
    event: AccountSecurityEvent,
  ): Promise<{ address: string; locale: string } | null> {
    if (event.recipient) {
      return event.recipient.verified ? event.recipient : null;
    }
    const user = await this.users.findById(event.userId);
    if (!user?.email || !user.emailVerified) return null;
    return { address: user.email, locale: user.locale };
  }
}
