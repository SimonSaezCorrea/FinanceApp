import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { compare } from "bcryptjs";

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
  InvalidCurrentPasswordError,
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

type TotpOutcome = "ok" | "invalid" | "locked" | "unauthorized";

/**
 * Step-up by TOTP or password (2026-09-25). The method must be one `auth.stepUpMethodsFor` allows
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
  ) {
    super(eventBus);
  }

  protected async loadContext(command: VerifyStepUpCommand): Promise<User> {
    const user = await this.users.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    const passkeyCount = (await this.passkeys.findByUserId(user.id)).length;
    const allowed = auth.stepUpMethodsFor({ mfaEnabled: user.mfaEnabled, passkeyCount });
    if (!allowed.includes(command.input.method)) throw new StepUpMethodNotAllowedError();
    return user;
  }

  protected async handle(
    command: VerifyStepUpCommand,
    user: User,
  ): Promise<HandleResult<auth.StepUpResponse>> {
    if (command.input.method === "password") {
      if (!user.passwordHash || !(await compare(command.input.password, user.passwordHash))) {
        throw new InvalidCurrentPasswordError();
      }
    } else {
      const outcome = await this.verifyTotp(user.id, command.input.code);
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

  /** Read-validate-write under a row lock, so concurrent wrong codes can't undercount failures. */
  private verifyTotp(userId: string, code: string): Promise<TotpOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.users.findByIdForUpdateWithTx(tx, userId);
      if (!locked) return "unauthorized";
      const now = new Date();
      if (locked.isMfaLocked(now)) return "locked";
      if (!isValidTotp(locked.mfaSecret, code)) {
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
