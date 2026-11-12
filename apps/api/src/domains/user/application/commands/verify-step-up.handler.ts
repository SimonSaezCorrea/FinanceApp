import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  PASSKEY_REPOSITORY,
  type PasskeyRepositoryPort,
} from "../../../passkey/domain/ports/passkey.repository.port";
import {
  SESSION_STEP_UP,
  type SessionStepUpPort,
} from "../../../session/domain/ports/session-step-up.port";
import {
  InvalidMfaCodeError,
  MfaLockedError,
  StepUpMethodNotAllowedError,
  UnauthorizedError,
} from "../../domain/errors";
import type { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { stepUpExpiry } from "../step-up";
import { isValidTotp, MFA_LOCKOUT_MINUTES, MFA_LOCKOUT_THRESHOLD } from "../totp";
import { VerifyStepUpCommand } from "./verify-step-up.command";
import { verifyPasswordCounted } from "../password-check";
import { MfaCodeService } from "../mfa-code-service";

type CodeOutcome = "ok" | "invalid" | "locked" | "unauthorized";

/**
 * Step-up by TOTP, an emailed code (specs/040) or password (2026-09-25). The method must be one `auth.stepUpMethodsFor` allows
 * for this user: with TOTP or a passkey configured the password alone is refused — a second factor
 * is what this protects. TOTP shares login's lockout counter (same row lock, same threshold) so
 * switching between the two never buys a guesser more attempts. On success the caller's own
 * session gets `stepUpAt`, which `CloseSession`/`RevokeOtherSessions` then require.
 */
@Injectable()
@CommandHandler(VerifyStepUpCommand)
export class VerifyStepUpHandler extends BaseCommandHandler<
  VerifyStepUpCommand,
  auth.StepUpResponse,
  User
> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PASSKEY_REPOSITORY) private readonly passkeys: PasskeyRepositoryPort,
    @Inject(SESSION_STEP_UP) private readonly stepUp: SessionStepUpPort,
    private readonly prisma: PrismaService,
    private readonly mfaCodes: MfaCodeService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: VerifyStepUpCommand): Promise<User> {
    const user = await this.users.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    // specs/041: a compromised passkey no longer counts as a way to confirm identity.
    const passkeyCount = await this.passkeys.countUsable(user.id);
    const method = user.mfaMethodOrDefault();
    const allowed = auth.stepUpMethodsFor({
      mfaMethod: method === "EMAIL" ? "email" : method === "TOTP" ? "totp" : null,
      passkeyCount,
    });
    if (!allowed.includes(command.input.method)) throw new StepUpMethodNotAllowedError();
    return user;
  }

  protected async handle(
    command: VerifyStepUpCommand,
    user: User,
  ): Promise<HandleResult<auth.StepUpResponse>> {
    if (command.input.method === "password") {
      // Counted like a login attempt (security run-3): unlimited guesses here let a stolen
      // session find the password and pass the step-up that guards changing the email.
      await verifyPasswordCounted(
        { prisma: this.prisma, users: this.users },
        user.id,
        command.input.password,
      );
    } else {
      const input = command.input;
      const outcome = await this.verifyCode(user.id, (tx, locked, now) =>
        input.method === "email"
          ? this.mfaCodes.verifyWithTx(tx, locked.id, "STEP_UP", input.code, now)
          : Promise.resolve(isValidTotp(locked.mfaSecret, input.code)),
      );
      // Thrown only AFTER the transaction committed — throwing inside would roll back the very
      // failure count the lockout depends on (same reasoning as VerifyMfaLoginHandler).
      if (outcome === "unauthorized") throw new UnauthorizedError();
      if (outcome === "locked") throw new MfaLockedError();
      if (outcome === "invalid") throw new InvalidMfaCodeError();
    }

    const now = new Date();
    await this.stepUp.markSteppedUp(user.id, command.sessionId, now);
    return { result: { verifiedUntil: stepUpExpiry(now).toISOString() }, events: [] };
  }

  /** Read-validate-write under a row lock, so concurrent wrong codes can't undercount failures.
   * TOTP and the emailed code (specs/040) share login's counter and lockout. A recovery code never
   * reaches here: the request schema only takes 6 digits. */
  private verifyCode(
    userId: string,
    check: (tx: unknown, locked: User, now: Date) => Promise<boolean>,
  ): Promise<CodeOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.users.findByIdForUpdateWithTx(tx, userId);
      if (!locked) return "unauthorized";
      const now = new Date();
      if (locked.isMfaLocked(now)) return "locked";
      if (!(await check(tx, locked, now))) {
        locked.recordMfaFailure(MFA_LOCKOUT_THRESHOLD, MFA_LOCKOUT_MINUTES, now);
        await this.users.saveWithTx(tx, locked);
        return locked.isMfaLocked(now) ? "locked" : "invalid";
      }
      locked.recordMfaSuccess();
      await this.users.saveWithTx(tx, locked);
      return "ok";
    });
  }
}
