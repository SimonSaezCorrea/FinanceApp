import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  USER_EMAIL_REPOSITORY,
  type UserEmailRepositoryPort,
} from "../../../user-email/domain/ports/user-email.repository.port";
import type { UserEmailProps } from "../../../user-email/domain/user-email.entity";
import { EmailAlreadyVerifiedError, UnauthorizedError } from "../../domain/errors";
import type { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { AccountEmailService } from "../account-emails";
import { assertLinkSent } from "../link-outcome";
import { ResendVerificationCommand } from "./resend-verification.command";

interface Context {
  user: User;
  target: UserEmailProps;
}

/** Sends the confirmation link again (specs/032 US1): to the pending address if there is one,
 * else to the unconfirmed primary. Retry-safe by the token table's partial unique index plus the
 * 60 s resend window (Principle VII form b). */
@Injectable()
@CommandHandler(ResendVerificationCommand)
export class ResendVerificationHandler extends BaseCommandHandler<
  ResendVerificationCommand,
  void,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(USER_EMAIL_REPOSITORY) private readonly emails: UserEmailRepositoryPort,
    private readonly accountEmails: AccountEmailService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: ResendVerificationCommand): Promise<Context> {
    const user = await this.users.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    const pending = await this.emails.findPending(user.id);
    if (pending) return { user, target: pending };
    const primary = await this.emails.findPrimary(user.id);
    if (!primary || primary.verifiedAt) throw new EmailAlreadyVerifiedError();
    return { user, target: primary };
  }

  protected async handle(
    command: ResendVerificationCommand,
    { user, target }: Context,
  ): Promise<HandleResult<void>> {
    const outcome = await this.accountEmails.sendVerification(
      { userId: user.id, locale: user.locale },
      target,
    );
    assertLinkSent(outcome);
    return { result: undefined, events: [] };
  }
}
