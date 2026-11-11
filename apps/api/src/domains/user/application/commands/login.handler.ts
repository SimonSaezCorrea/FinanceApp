import { Inject, Injectable, Logger } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { compare } from "bcryptjs";

import { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import { InvalidCredentialsError, LoginLockedError } from "../../domain/errors";
import type { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { LOGIN_LOCKOUT_MINUTES, LOGIN_LOCKOUT_THRESHOLD, maskRut } from "../login-lockout";
import { SessionIssuer } from "../session-issuer";
import { TokenIssuer } from "../token-issuer";
import type { AuthResult } from "./register.handler";
import { LoginCommand } from "./login.command";
import {
  TRUSTED_DEVICE_REPOSITORY,
  type TrustedDeviceRepositoryPort,
} from "../../../trusted-device/domain/ports/trusted-device.repository.port";
import { trustedDeviceIsValidFor } from "../../../trusted-device/domain/trusted-device.entity";
import { hashTrustedDeviceToken } from "../trusted-device-cookie";
import { MfaCodeService } from "../mfa-code-service";

/**
 * A user without MFA gets a real session, exactly as before. A user WITH MFA active gets
 * neither `tokens` nor `user` — only a short-lived pending token, which the controller carries
 * in its own httpOnly cookie (never the session cookies) until `VerifyMfaLoginCommand`
 * completes the second factor (specs/021).
 */
export type LoginResult =
  | ({ mfaRequired: false } & AuthResult)
  | {
      mfaRequired: true;
      mfaPendingToken: string;
      /** Which second factor to ask for (specs/040). */
      mfaMethod: auth.MfaMethod;
      /** `email` only: whether a code went out now. */
      codeSent?: boolean;
      /** `email` only, when the resend limit held it back. */
      retryAfterSeconds?: number;
    };

type Outcome = { kind: "invalid" } | { kind: "locked" } | { kind: "success"; user: User };

interface Context {
  userId: string;
  maskedRut: string;
  /** The hash the password was compared against, outside any lock. */
  passwordHash: string;
  /** Whether the read (unlocked) found the account locked: no bcrypt is spent then. */
  lockedAtRead: boolean;
}

/**
 * Login by RUT + password, rate-limited like the second factor: `LOGIN_LOCKOUT_THRESHOLD`
 * consecutive wrong passwords lock the account for `LOGIN_LOCKOUT_MINUTES`, during which even
 * the right password is refused (`LOGIN_LOCKED`, 429).
 *
 * Same concurrency shape as `VerifyMfaLoginHandler`: the password check and the counter update
 * run inside ONE `prisma.$transaction` on the row locked with `SELECT … FOR UPDATE`, so N
 * concurrent guesses count N times instead of all reading the same stale counter. The
 * transaction returns an `Outcome` instead of throwing, because throwing would roll back the
 * incremented counter this path exists to keep; the domain error is raised after the commit.
 *
 * bcrypt runs BEFORE that transaction, on the hash read without a lock (run-2): computing it with
 * the row locked held one pooled connection per concurrent login of the same account, starving
 * everyone else's requests. Inside the lock only the outcome is recorded; if the hash changed
 * meanwhile (a password change or reset), the attempt is refused without counting.
 *
 * An unknown RUT is refused before any lock with the same `INVALID_CREDENTIALS` as a wrong
 * password (there is no row to count against).
 */
@Injectable()
@CommandHandler(LoginCommand)
export class LoginHandler extends BaseCommandHandler<LoginCommand, LoginResult, Context> {
  private readonly logger = new Logger(LoginHandler.name);

  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    private readonly tokenIssuer: TokenIssuer,
    private readonly sessionIssuer: SessionIssuer,
    private readonly prisma: PrismaService,
    @Inject(TRUSTED_DEVICE_REPOSITORY) private readonly devices: TrustedDeviceRepositoryPort,
    private readonly mfaCodes: MfaCodeService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: LoginCommand): Promise<Context> {
    // Login is by RUT, not email (Chilean convention) — normalized the same way it was at
    // registration, so "12.345.678-5" and "123456785" resolve to the same account.
    const identifierValue = auth.normalizeRut(command.input.identifierValue);
    const maskedRut = maskRut(identifierValue);
    const user = await this.repo.findByIdentifierValue(identifierValue);
    if (!user?.passwordHash) {
      this.logger.warn(`failed login attempt for ${maskedRut}`);
      throw new InvalidCredentialsError();
    }
    return {
      userId: user.id,
      maskedRut,
      passwordHash: user.passwordHash,
      lockedAtRead: user.isLoginLocked(new Date()),
    };
  }

  protected async handle(
    command: LoginCommand,
    context: Context,
  ): Promise<HandleResult<LoginResult>> {
    if (context.lockedAtRead) {
      this.logger.warn(`login refused, account locked: ${context.maskedRut}`);
      throw new LoginLockedError();
    }
    const matches = await compare(command.input.password, context.passwordHash);
    const outcome = await this.prisma.$transaction((tx) =>
      this.recordOutcomeLocked(tx, context, matches),
    );

    if (outcome.kind === "locked") {
      this.logger.warn(`login refused, account locked: ${context.maskedRut}`);
      throw new LoginLockedError();
    }
    if (outcome.kind === "invalid") {
      this.logger.warn(`failed login attempt for ${context.maskedRut}`);
      throw new InvalidCredentialsError();
    }

    const user = outcome.user;
    // ACCOUNT_DISABLED — rejected even with otherwise-valid credentials.
    user.assertActive();
    if (user.mfaEnabled && (await this.isRememberedDevice(user.id, command.trustedDeviceToken))) {
      this.logger.log(`user logged in on a remembered device: ${user.id}`);
    } else if (user.mfaEnabled) {
      this.logger.log(`password verified, awaiting MFA: ${user.id}`);
      const mfaPendingToken = this.tokenIssuer.issueMfaPending(user.id);
      if (user.mfaMethodOrDefault() === "EMAIL") {
        // Sent after the password check committed; a failed send never fails the login (the
        // screen offers "Reenviar código" and the recovery codes).
        const sent = await this.mfaCodes.issueAndSend(
          {
            userId: user.id,
            email: user.email,
            emailVerified: user.emailVerified,
            locale: user.locale,
          },
          "LOGIN",
        );
        return {
          result: {
            mfaRequired: true,
            mfaPendingToken,
            mfaMethod: "email",
            codeSent: sent.sent,
            ...(!sent.sent && sent.reason === "rate-limited"
              ? { retryAfterSeconds: sent.retryAfterSeconds }
              : {}),
          },
          events: [],
        };
      }
      return { result: { mfaRequired: true, mfaPendingToken, mfaMethod: "totp" }, events: [] };
    }
    this.logger.log(`user logged in: ${user.id}`);
    const tokens = await this.sessionIssuer.establish(
      { id: user.id, email: user.email },
      { userAgent: command.device?.userAgent, ip: command.device?.ip },
    );
    return { result: { mfaRequired: false, tokens, user: user.toContract() }, events: [] };
  }

  /** A remembered browser of THIS account, not expired (specs/040). Touched when it is used. */
  private async isRememberedDevice(userId: string, token: string | undefined): Promise<boolean> {
    if (!token) return false;
    const now = new Date();
    const device = await this.devices.findValidByTokenHash(hashTrustedDeviceToken(token), now);
    if (!device || !trustedDeviceIsValidFor(device, userId, now)) return false;
    await this.devices.touch(device.id, now);
    return true;
  }

  private async recordOutcomeLocked(
    tx: unknown,
    context: Context,
    matches: boolean,
  ): Promise<Outcome> {
    const user = await this.repo.findByIdForUpdateWithTx(tx, context.userId);
    if (!user?.passwordHash) return { kind: "invalid" };

    const now = new Date();
    if (user.isLoginLocked(now)) return { kind: "locked" };
    // The password changed between the read and the lock: what was checked is no longer it.
    if (user.passwordHash !== context.passwordHash) return { kind: "invalid" };

    if (!matches) {
      user.recordLoginFailure(LOGIN_LOCKOUT_THRESHOLD, LOGIN_LOCKOUT_MINUTES, now);
      await this.repo.saveWithTx(tx, user);
      return { kind: user.isLoginLocked(now) ? "locked" : "invalid" };
    }

    if (user.recordLoginSuccess()) await this.repo.saveWithTx(tx, user);
    return { kind: "success", user };
  }
}
