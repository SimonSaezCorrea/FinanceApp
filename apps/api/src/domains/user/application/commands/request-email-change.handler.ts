import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import { isWithinResendWindow } from "../../../email-token/domain/email-token";
import {
  USER_EMAIL_REPOSITORY,
  type UserEmailRepositoryPort,
} from "../../../user-email/domain/ports/user-email.repository.port";
import { normalizeEmailAddress } from "../../../user-email/domain/user-email.entity";
import {
  EmailAlreadyPrimaryError,
  EmailTakenError,
  EmailUnavailableError,
  UnauthorizedError,
} from "../../domain/errors";
import type { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { AccountEmailService } from "../account-emails";
import { assertLinkSent } from "../link-outcome";
import { userEmailToContract } from "../user-email.mapper";
import { RequestEmailChangeCommand } from "./request-email-change.command";

interface Context {
  user: User;
  address: string;
}

/**
 * Asks to change the account's email (specs/032 US1, clarify Q1): the address is registered as
 * PENDING and gets a confirmation link; the primary stays the one receiving email and recovering
 * the password until the link is followed. A newer request replaces an older pending one (one
 * PENDING per account — partial unique index). Repeating the same address within the resend
 * window reuses the row and the link just sent (Principle VII form b).
 */
@Injectable()
@CommandHandler(RequestEmailChangeCommand)
export class RequestEmailChangeHandler extends BaseCommandHandler<
  RequestEmailChangeCommand,
  auth.UserEmail,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(USER_EMAIL_REPOSITORY) private readonly emails: UserEmailRepositoryPort,
    private readonly accountEmails: AccountEmailService,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: RequestEmailChangeCommand): Promise<Context> {
    const user = await this.users.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    const address = normalizeEmailAddress(command.address);
    if (user.email === address) throw new EmailAlreadyPrimaryError();
    const owner = await this.users.findByEmail(address);
    if (owner && owner.id !== user.id) throw new EmailTakenError();
    // No pending row without the email that confirms it (FR-005).
    if (!this.accountEmails.available) throw new EmailUnavailableError();
    return { user, address };
  }

  protected async handle(
    _command: RequestEmailChangeCommand,
    { user, address }: Context,
  ): Promise<HandleResult<auth.UserEmail>> {
    const now = new Date();
    const existing = await this.emails.findPending(user.id);
    const pending =
      existing && existing.address === address && isWithinResendWindow(existing.createdAt, now)
        ? existing
        : // Retiring the previous pending address and adding this one happen together.
          await this.prisma.$transaction((tx) =>
            this.emails.addPendingWithTx(tx, user.id, address, now),
          );
    const outcome = await this.accountEmails.sendVerification(
      { userId: user.id, locale: user.locale },
      pending,
    );
    assertLinkSent(outcome);
    return { result: userEmailToContract(pending), events: [] };
  }
}
