import { Inject, Injectable, Logger } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { hash } from "bcryptjs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  TRUSTED_DEVICE_REPOSITORY,
  type TrustedDeviceRepositoryPort,
} from "../../../trusted-device/domain/ports/trusted-device.repository.port";
import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../../session/domain/ports/session.repository.port";
import {
  EMAIL_TOKEN_REPOSITORY,
  type EmailTokenRepositoryPort,
} from "../../../email-token/domain/ports/email-token.repository.port";
import {
  USER_EMAIL_REPOSITORY,
  type UserEmailRepositoryPort,
} from "../../../user-email/domain/ports/user-email.repository.port";
import {
  PASSKEY_REPOSITORY,
  type PasskeyRepositoryPort,
} from "../../../passkey/domain/ports/passkey.repository.port";
import {
  SESSION_STEP_UP,
  type SessionStepUpPort,
} from "../../../session/domain/ports/session-step-up.port";
import { cancelPendingEmailChangeWithTx } from "../pending-email-change";
import { requireStepUpIfProtected } from "../step-up";
import {
  InvalidCurrentPasswordError,
  StepUpRequiredError,
  UnauthorizedError,
} from "../../domain/errors";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { ChangePasswordCommand } from "./change-password.command";
import { AccountSecurityEvent } from "../../domain/events/account-security.event";
import { verifyPasswordCounted } from "../password-check";

interface Context {
  userId: string;
  currentSessionId: string;
  /** The hash the current password was checked against: the write refuses if it changed. */
  verifiedHash: string;
  /** The step-up this request spends (an account with a second factor or a passkey), else null. */
  steppedUpAt: Date | null;
  /** Set by `handle()`. */
  newHash?: string;
}

@Injectable()
@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler extends BaseCommandHandler<
  ChangePasswordCommand,
  void,
  Context
> {
  private readonly logger = new Logger(ChangePasswordHandler.name);

  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    private readonly prisma: PrismaService,
    @Inject(TRUSTED_DEVICE_REPOSITORY) private readonly devices: TrustedDeviceRepositoryPort,
    @Inject(USER_EMAIL_REPOSITORY) private readonly emails: UserEmailRepositoryPort,
    @Inject(EMAIL_TOKEN_REPOSITORY) private readonly tokens: EmailTokenRepositoryPort,
    @Inject(SESSION_STEP_UP) private readonly stepUp: SessionStepUpPort,
    @Inject(PASSKEY_REPOSITORY) private readonly passkeys: PasskeyRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: ChangePasswordCommand): Promise<Context> {
    const user = await this.repo.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    // Security run-3: with a second factor or a passkey, the session and the password are not
    // enough to replace the password — the session must have stepped up with that factor. Checked
    // first, so a session without it can't even try passwords here.
    const steppedUpAt = await requireStepUpIfProtected(
      { stepUp: this.stepUp, passkeys: this.passkeys },
      user,
      command.currentSessionId,
    );
    // Counted (security run-3): a stolen session can't guess it freely.
    const verifiedHash = await verifyPasswordCounted(
      { users: this.repo },
      command.userId,
      command.input.currentPassword,
    );
    return {
      userId: command.userId,
      currentSessionId: command.currentSessionId,
      verifiedHash,
      steppedUpAt,
    };
  }

  protected async handle(
    command: ChangePasswordCommand,
    context: Context,
  ): Promise<HandleResult<void>> {
    context.newHash = await hash(command.input.newPassword, 12);
    this.logger.log(`password changed: ${command.userId}`);
    return {
      result: undefined,
      events: [new AccountSecurityEvent(command.userId, "PASSWORD_CHANGED", new Date())],
    };
  }

  /** A password change is a signal the user wants to invalidate earlier access
   * (specs/024) — closing every other session runs in the SAME transaction as the
   * new hash, so a failure here rolls back the credential change too (FR-007).
   *
   * The row is re-read locked and only the hash changes on it (security run-3): saving the copy
   * read before would put back counters and lockouts written meanwhile. */
  protected override async persist(context: Context): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (context.steppedUpAt) {
        const spent = await this.stepUp.consumeWithTx(
          tx,
          context.userId,
          context.currentSessionId,
          context.steppedUpAt,
        );
        if (!spent) throw new StepUpRequiredError();
      }
      const user = await this.repo.findByIdForUpdateWithTx(tx, context.userId);
      // Changed (or gone) since it was checked: what was verified is no longer the password.
      if (!user || user.passwordHash !== context.verifiedHash || !context.newHash) {
        throw new InvalidCurrentPasswordError();
      }
      user.changePasswordHash(context.newHash);
      await this.repo.saveWithTx(tx, user);
      await this.sessions.closeAllExceptForUserWithTx(tx, user.id, context.currentSessionId);
      // specs/040: a new password forgets every remembered device.
      await this.devices.deleteAllForUserWithTx(tx, user.id);
      // Security run-3: a pending change of email (perhaps requested from a stolen session) is
      // cancelled with its links, or it could still take the account after this.
      await cancelPendingEmailChangeWithTx(
        { emails: this.emails, tokens: this.tokens },
        tx,
        user.id,
        new Date(),
      );
    });
  }
}
