import { Inject, Injectable, Logger } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { compare } from "bcryptjs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  MFA_RECOVERY_CODE_REPOSITORY,
  type MfaRecoveryCodeRepositoryPort,
} from "../../../mfa-recovery-code/domain/ports/mfa-recovery-code.repository.port";
import { InvalidMfaCodeError, MfaLockedError, UnauthorizedError } from "../../domain/errors";
import type { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { SessionIssuer } from "../session-issuer";
import { isValidTotp, MFA_LOCKOUT_MINUTES, MFA_LOCKOUT_THRESHOLD } from "../totp";
import { looksLikeRecoveryCode } from "../recovery-code-generator";
import type { AuthResult } from "./register.handler";
import { VerifyMfaLoginCommand } from "./verify-mfa-login.command";
import {
  TRUSTED_DEVICE_REPOSITORY,
  type TrustedDeviceRepositoryPort,
} from "../../../trusted-device/domain/ports/trusted-device.repository.port";
import { trustedDeviceExpiry } from "../../../trusted-device/domain/trusted-device.entity";
import { generateRowId } from "../../../../infra/id/generate-row-id";
import { AccountSecurityEvent } from "../../domain/events/account-security.event";
import { parseDeviceLabel } from "../device-info";
import { generateTrustedDeviceToken, hashTrustedDeviceToken } from "../trusted-device-cookie";
import { MfaCodeService } from "../mfa-code-service";

/** What a successful second factor returns: the session, plus the cookie token of a device the
 * person asked to remember (specs/040). */
export type VerifyMfaLoginResult = AuthResult & { trustedDeviceToken?: string };

/** A device to remember, prepared before the transaction so the token never depends on it. */
interface RememberPlan {
  token: string;
  deviceLabel: string;
}

type Outcome =
  | { kind: "unauthorized" }
  | { kind: "locked" }
  | { kind: "invalid" }
  | { kind: "success"; user: User; remaining: number; remembered: RememberPlan | null };

/**
 * Completes a pending login's second factor. The ENTIRE read-validate-write cycle runs inside
 * one `prisma.$transaction`, locking the user row with `findByIdForUpdateWithTx` (`SELECT ...
 * FOR UPDATE`) — without this, two concurrent invalid attempts could both read
 * `mfaFailedAttempts = 0` and both write back `1`, undercounting the very race this handler
 * exists to prevent (the same class of bug `debt`'s `register-payment` had before specs/015's
 * fix, confirmed empirically there: 6 concurrent requests advanced a counter by only 2 until the
 * read moved inside the lock).
 *
 * The transaction callback never THROWS on a business failure — Prisma would roll back the
 * write we need to keep (the incremented counter). Instead it returns a discriminated
 * `Outcome`, and only AFTER the transaction commits does `handle()` translate a non-success
 * outcome into the right domain error. `persist()` is left as the base class's no-op: this
 * handler is its own persistence boundary end to end (specs/021 research R8, extended for
 * concurrency by this same feature — same documented-exception spirit as
 * `PayCreditStatementHandler`'s own cross-aggregate `persist()` override).
 */
@Injectable()
@CommandHandler(VerifyMfaLoginCommand)
export class VerifyMfaLoginHandler extends BaseCommandHandler<
  VerifyMfaLoginCommand,
  VerifyMfaLoginResult,
  { userId: string }
> {
  private readonly logger = new Logger(VerifyMfaLoginHandler.name);

  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    @Inject(MFA_RECOVERY_CODE_REPOSITORY)
    private readonly recoveryCodes: MfaRecoveryCodeRepositoryPort,
    private readonly sessionIssuer: SessionIssuer,
    private readonly prisma: PrismaService,
    @Inject(TRUSTED_DEVICE_REPOSITORY) private readonly devices: TrustedDeviceRepositoryPort,
    private readonly mfaCodes: MfaCodeService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: VerifyMfaLoginCommand): Promise<{ userId: string }> {
    return { userId: command.userId };
  }

  protected async handle(
    command: VerifyMfaLoginCommand,
    context: { userId: string },
  ): Promise<HandleResult<VerifyMfaLoginResult>> {
    const remember: RememberPlan | null = command.input.rememberDevice
      ? {
          token: generateTrustedDeviceToken(),
          deviceLabel: parseDeviceLabel(command.device?.userAgent) ?? "",
        }
      : null;
    const code = command.input.code.trim();
    // A recovery code is checked BEFORE the row lock (security run-3): bcrypt against up to 10
    // hashes (~0.7 s) with the row locked held a pooled connection per attempt, as login's
    // password check did before run-2. Inside the lock only the matched code is claimed.
    const recoveryMatch = looksLikeRecoveryCode(code)
      ? await this.matchRecoveryCode(context.userId, code)
      : undefined;
    if (recoveryMatch === "locked") throw new MfaLockedError();
    const outcome = await this.prisma.$transaction((tx) =>
      this.runLocked(tx, context.userId, code, remember, recoveryMatch),
    );

    switch (outcome.kind) {
      case "unauthorized":
        throw new UnauthorizedError();
      case "locked":
        throw new MfaLockedError();
      case "invalid":
        throw new InvalidMfaCodeError();
      case "success": {
        this.logger.log(`MFA verified: ${context.userId}`);
        const tokens = await this.sessionIssuer.establish(
          { id: outcome.user.id, email: outcome.user.email },
          { userAgent: command.device?.userAgent, ip: command.device?.ip },
        );
        const remembered = outcome.remembered;
        return {
          result: {
            tokens,
            user: outcome.user.toContract(outcome.remaining),
            ...(remembered ? { trustedDeviceToken: remembered.token } : {}),
          },
          events: remembered
            ? [
                new AccountSecurityEvent(
                  outcome.user.id,
                  "TRUSTED_DEVICE_ADDED",
                  new Date(),
                  remembered.deviceLabel || undefined,
                ),
              ]
            : [],
        };
      }
    }
  }

  private async runLocked(
    tx: unknown,
    userId: string,
    code: string,
    remember: RememberPlan | null,
    /** Set when `code` looks like a recovery code: the id it matched outside the lock, or null. */
    recoveryMatch: string | null | undefined,
  ): Promise<Outcome> {
    const user = await this.repo.findByIdForUpdateWithTx(tx, userId);
    if (!user) return { kind: "unauthorized" };

    const now = new Date();
    if (user.isMfaLocked(now)) return { kind: "locked" };

    // A recovery code works with either method; otherwise the account's own method decides:
    // the app's TOTP, or the emailed LOGIN code (consumed atomically, one use).
    // A claim that loses a race (used, or the codes regenerated meanwhile) counts as invalid.
    let valid: boolean;
    if (recoveryMatch !== undefined) {
      valid =
        recoveryMatch !== null && (await this.recoveryCodes.markUsedWithTx(tx, recoveryMatch));
    } else if (user.mfaMethodOrDefault() === "EMAIL") {
      valid = await this.mfaCodes.verifyWithTx(tx, user.id, "LOGIN", code, now);
    } else {
      valid = isValidTotp(user.mfaSecret, code);
    }

    if (!valid) {
      user.recordMfaFailure(MFA_LOCKOUT_THRESHOLD, MFA_LOCKOUT_MINUTES, now);
      await this.repo.saveWithTx(tx, user);
      return { kind: user.isMfaLocked(now) ? "locked" : "invalid" };
    }

    user.recordMfaSuccess();
    await this.repo.saveWithTx(tx, user);
    if (remember) {
      await this.devices.rememberWithTx(tx, {
        id: generateRowId(),
        userId: user.id,
        tokenHash: hashTrustedDeviceToken(remember.token),
        deviceLabel: remember.deviceLabel,
        createdAt: now,
        expiresAt: trustedDeviceExpiry(now),
      });
    }
    const remaining = await this.recoveryCodes.countUnused(user.id);
    return { kind: "success", user, remaining, remembered: remember };
  }

  /** Which unused recovery code `code` is, compared without any lock; "locked" when the account
   * is already locked, so no bcrypt is spent on it. The claim happens later, inside the lock. */
  private async matchRecoveryCode(userId: string, code: string): Promise<string | null | "locked"> {
    const user = await this.repo.findById(userId);
    if (user?.isMfaLocked(new Date())) return "locked";
    const candidates = await this.recoveryCodes.findUnusedByUser(userId);
    for (const candidate of candidates) {
      if (await compare(code, candidate.codeHash)) return candidate.id;
    }
    return null;
  }
}
