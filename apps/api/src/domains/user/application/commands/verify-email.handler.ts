import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import { hashToken } from "../../../email-token/domain/email-token";
import {
  EMAIL_TOKEN_REPOSITORY,
  type EmailTokenRepositoryPort,
} from "../../../email-token/domain/ports/email-token.repository.port";
import { isConfirmable } from "../../../user-email/domain/user-email.entity";
import {
  USER_EMAIL_REPOSITORY,
  type UserEmailRepositoryPort,
} from "../../../user-email/domain/ports/user-email.repository.port";
import { EmailTokenInvalidError } from "../../domain/errors";
import { AccountSecurityEvent } from "../../domain/events/account-security.event";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { VerifyEmailCommand } from "./verify-email.command";

/**
 * Confirms an address from its link (specs/032 US1). One transaction: consume the token
 * atomically (a replay or a second click gets `EMAIL_TOKEN_INVALID`, Principle VII form a),
 * then either confirm the primary in place or promote the pending address — the previous primary
 * moves to history and gets an `EMAIL_CHANGED` notice if it was confirmed. If the pending
 * address became another account's primary meanwhile, the `user.email` unique constraint
 * answers `EMAIL_TAKEN` and the whole transaction rolls back.
 */
@Injectable()
@CommandHandler(VerifyEmailCommand)
export class VerifyEmailHandler extends BaseCommandHandler<VerifyEmailCommand, void, void> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(USER_EMAIL_REPOSITORY) private readonly emails: UserEmailRepositoryPort,
    @Inject(EMAIL_TOKEN_REPOSITORY) private readonly tokens: EmailTokenRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<void> {
    // Everything is read inside the transaction in handle().
  }

  protected async handle(command: VerifyEmailCommand): Promise<HandleResult<void>> {
    const now = new Date();
    const event = await this.prisma.$transaction(async (tx) => {
      const token = await this.tokens.consumeWithTx(
        tx,
        hashToken(command.token),
        "VERIFY_EMAIL",
        now,
      );
      if (!token?.userEmailId) throw new EmailTokenInvalidError();
      // Everything below reads and writes inside this transaction, the account row locked first,
      // so a change requested or an address removed meanwhile can't be acted on halfway.
      const user = await this.users.findByIdForUpdateWithTx(tx, token.userId);
      if (!user) throw new EmailTokenInvalidError();
      const target = await this.emails.findByIdWithTx(tx, token.userEmailId);
      if (!target || target.userId !== user.id || !isConfirmable(target)) {
        throw new EmailTokenInvalidError();
      }

      if (target.status === "PRIMARY") {
        if (!(await this.emails.markVerifiedWithTx(tx, target.id, now))) {
          throw new EmailTokenInvalidError();
        }
        user.confirmPrimaryEmail(target.address, now);
        await this.users.saveWithTx(tx, user);
        return null;
      }

      // The previous primary, read from the locked account row (it mirrors the PRIMARY row).
      const previous = user.email ? { address: user.email, verified: user.emailVerified } : null;
      // Conditional: false when the pending address was replaced or removed meanwhile — throwing
      // rolls back the primary's demotion too.
      if (!(await this.emails.promotePendingWithTx(tx, user.id, target.id, now))) {
        throw new EmailTokenInvalidError();
      }
      user.confirmPrimaryEmail(target.address, now);
      await this.users.saveWithTx(tx, user);
      return previous
        ? new AccountSecurityEvent(user.id, "EMAIL_CHANGED", now, target.address, {
            address: previous.address,
            locale: user.locale,
            verified: previous.verified,
          })
        : null;
    });
    return { result: undefined, events: event ? [event] : [] };
  }
}
