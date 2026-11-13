import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { hash } from "bcryptjs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  TRUSTED_DEVICE_REPOSITORY,
  type TrustedDeviceRepositoryPort,
} from "../../../trusted-device/domain/ports/trusted-device.repository.port";
import { hashToken } from "../../../email-token/domain/email-token";
import {
  EMAIL_TOKEN_REPOSITORY,
  type EmailTokenRepositoryPort,
} from "../../../email-token/domain/ports/email-token.repository.port";
import {
  PASSKEY_REPOSITORY,
  type PasskeyRepositoryPort,
} from "../../../passkey/domain/ports/passkey.repository.port";
import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../../session/domain/ports/session.repository.port";
import {
  USER_EMAIL_REPOSITORY,
  type UserEmailRepositoryPort,
} from "../../../user-email/domain/ports/user-email.repository.port";
import { cancelPendingEmailChangeWithTx } from "../pending-email-change";
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
    @Inject(TRUSTED_DEVICE_REPOSITORY) private readonly devices: TrustedDeviceRepositoryPort,
    @Inject(USER_EMAIL_REPOSITORY) private readonly emails: UserEmailRepositoryPort,
    @Inject(PASSKEY_REPOSITORY) private readonly passkeys: PasskeyRepositoryPort,
  ) {
    super(eventBus);
  }

  /** bcrypt is slow on purpose — computed before opening the transaction, and only for a link
   * that is usable right now (run-2): a bogus token is refused with one indexed read instead of
   * costing ~300 ms of CPU. The transaction still consumes it atomically. */
  protected async loadContext(command: ResetPasswordCommand): Promise<string> {
    const usable = await this.tokens.isUsable(
      hashToken(command.token),
      "RESET_PASSWORD",
      new Date(),
    );
    if (!usable) throw new EmailTokenInvalidError();
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
      // specs/040: a recovered password forgets every remembered device.
      await this.devices.deleteAllForUserWithTx(tx, user.id);
      // And every passkey (2026-11-12): one added by whoever had a stolen session signs in with
      // no password and no second factor, so recovering the account must not leave it behind.
      // The owner registers theirs again from Perfil, Seguridad.
      await this.passkeys.deleteAllForUserWithTx(tx, user.id);
      // A change of email requested before (perhaps by whoever forced this reset) is cancelled.
      await cancelPendingEmailChangeWithTx(
        { emails: this.emails, tokens: this.tokens },
        tx,
        user.id,
        now,
      );
      return user.id;
    });
    return { result: undefined, events: [new AccountSecurityEvent(userId, "PASSWORD_RESET", now)] };
  }
}
