import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { StringValue } from "ms";

import { getMfaPendingTokenSecret } from "../../../infra/config/mfa.config";
import { MfaPendingTokenInvalidError } from "../domain/errors";

const MFA_PENDING_PURPOSE = "mfa-pending";
const MFA_PENDING_EXPIRES: StringValue = "5m";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Issues/verifies the JWT access+refresh pair. Lives in the application layer
 * (not a repository port, per FR-011 — it has no Prisma/DB dependency at all,
 * it's a pure JWT/config concern injected the same way a NestJS controller
 * used to depend on `ConfigService` directly) and is shared by
 * `Register`/`Login`/`Refresh` handlers so the token shape/lifetime rules
 * live in exactly one place.
 */
@Injectable()
export class TokenIssuer {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Reads a JWT lifetime env var (e.g. "15m", "7d" — see .env.example) as jsonwebtoken's expiresIn type. */
  private expiresIn(key: string, fallback: StringValue): StringValue {
    return (this.config.get<string>(key) as StringValue | undefined) ?? fallback;
  }

  issue(user: { id: string; email: string | null }): TokenPair {
    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email },
      {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: this.expiresIn("JWT_ACCESS_EXPIRES", "15m"),
      },
    );
    const refreshToken = this.jwt.sign(
      { sub: user.id },
      {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: this.expiresIn("JWT_REFRESH_EXPIRES", "7d"),
      },
    );
    return { accessToken, refreshToken };
  }

  /** Throws (jsonwebtoken's own error) on an invalid/expired token — callers
   * translate that into `InvalidRefreshTokenError`. */
  verifyRefresh(token: string): { sub: string } {
    return this.jwt.verify<{ sub: string }>(token, {
      secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
    });
  }

  /**
   * Issues the short-lived "second factor pending" token (specs/021) — signed with a secret
   * DIFFERENT from the session JWTs (`getMfaPendingTokenSecret`, never `JWT_ACCESS_SECRET`) so a
   * pending token can never be mistaken for a real session token, structurally rather than by
   * convention. Carries a `purpose` claim as a second, cheap layer of the same defense.
   */
  issueMfaPending(userId: string): string {
    return this.jwt.sign(
      { sub: userId, purpose: MFA_PENDING_PURPOSE },
      { secret: getMfaPendingTokenSecret(this.config), expiresIn: MFA_PENDING_EXPIRES },
    );
  }

  /** Throws `MfaPendingTokenInvalidError` on a missing/expired/malformed/wrong-purpose token. */
  verifyMfaPending(token: string): { sub: string } {
    let payload: { sub: string; purpose?: string };
    try {
      payload = this.jwt.verify<{ sub: string; purpose?: string }>(token, {
        secret: getMfaPendingTokenSecret(this.config),
      });
    } catch {
      throw new MfaPendingTokenInvalidError();
    }
    if (payload.purpose !== MFA_PENDING_PURPOSE) {
      throw new MfaPendingTokenInvalidError();
    }
    return { sub: payload.sub };
  }
}
