import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { hash } from "bcryptjs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import { hashToken } from "../../../email-token/domain/email-token";
import {
  EMAIL_TOKEN_REPOSITORY,
  type EmailTokenRepositoryPort,
} from "../../../email-token/domain/ports/email-token.repository.port";
import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../../session/domain/ports/session.repository.port";
import { EmailTokenInvalidError } from "../../domain/errors";
import { AccountSecurityEvent } from "../../domain/events/account-security.event";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { ResetPasswordCommand } from "./reset-password.command";

/**
 * Chooses a new password from a recovery link (specs/032 US2). One transaction: consume the
 * token atomically (single use, Principle VII form a), set the new hash, lift the login lockout,
 * close EVERY session (FR-019). The second factor is untouched (FR-020) and no session is
 * created: the person signs in with the new password (and their second factor). The
 * `PASSWORD_RESET` notice goes out after the commit.
 */
@Injectable()
@CommandHandler(ResetPasswordCommand)
export class ResetPasswordHandler extends BaseCommandHandler<ResetPasswordCommand, void, string> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(EMAIL_TOKEN_REPOSITORY) private readonly tokens: EmailTokenRepositoryPort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  /** bcrypt is slow on purpose — computed before opening the transaction. */
  protected loadContext(command: ResetPasswordCommand): Promise<string> {
    return hash(command.newPassword, 12);
  }

  protected async handle(
    command: ResetPasswordCommand,
    passwordHash: string,
  ): Promise<HandleResult<void>> {
    const now = new Date();
    const userId = await this.prisma.$transaction(async (tx) => {
      const token = await this.tokens.consumeWithTx(
        tx,
        hashToken(command.token),
        "RESET_PASSWORD",
        now,
      );
      if (!token) throw new EmailTokenInvalidError();
      const user = await this.users.findByIdForUpdateWithTx(tx, token.userId);
      if (!user || user.status !== "ACTIVE") throw new EmailTokenInvalidError();
      user.resetPassword(passwordHash);
      await this.users.saveWithTx(tx, user);
      await this.sessions.closeAllForUserWithTx(tx, user.id);
      return user.id;
    });
    return { result: undefined, events: [new AccountSecurityEvent(userId, "PASSWORD_RESET", now)] };
  }
}
