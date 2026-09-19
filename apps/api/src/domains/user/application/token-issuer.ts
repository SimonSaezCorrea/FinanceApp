import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { StringValue } from "ms";

import { generateRowId } from "../../../infra/id/generate-row-id";
import { getMfaPendingTokenSecret } from "../../../infra/config/mfa.config";
import { MfaPendingTokenInvalidError } from "../domain/errors";

const MFA_PENDING_PURPOSE = "mfa-pending";
const MFA_PENDING_EXPIRES: StringValue = "5m";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** The `sid` claim embedded in both tokens above (specs/023) — same value on a brand
   * new login and on a refresh that reused an existing session (research.md R6). */
  sessionId: string;
  /** When the `Session` row for `sessionId` should expire — mirrors the refresh token's
   * own lifetime, computed here once so callers never re-derive it from the env var. */
  sessionExpiresAt: Date;
}

/** Parses a `JWT_*_EXPIRES`-shaped duration ("15m", "7d", …) into milliseconds — the
 * same suffix set `parseDurationMs` in `auth.controller.ts` already supports, kept local
 * here rather than pulled in from the presentation layer (application code doesn't
 * depend on a controller file). */
function durationMs(value: StringValue): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid token duration format: "${value}". Use a number followed by s/m/h/d.`);
  }
  const n = Number.parseInt(match[1], 10);
  const units: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * (units[match[2]] ?? 0);
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

  /**
   * `sessionId` reuses an existing session's id as the `sid` claim (a refresh rotating
   * its tokens, research.md R6) — omitted, a brand new one is minted (a fresh login).
   * Either way, the SAME `sid` lands in both the access and refresh token, which is
   * what lets `JwtAuthGuard` and `RefreshTokenHandler` each check the same `Session` row.
   */
  issue(user: { id: string; email: string | null }, sessionId?: string): TokenPair {
    const sid = sessionId ?? generateRowId();
    const refreshExpiresIn = this.expiresIn("JWT_REFRESH_EXPIRES", "7d");
    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, sid },
      {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: this.expiresIn("JWT_ACCESS_EXPIRES", "15m"),
      },
    );
    const refreshToken = this.jwt.sign(
      { sub: user.id, sid },
      {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: refreshExpiresIn,
      },
    );
    return {
      accessToken,
      refreshToken,
      sessionId: sid,
      sessionExpiresAt: new Date(Date.now() + durationMs(refreshExpiresIn)),
    };
  }

  /** Throws (jsonwebtoken's own error) on an invalid/expired token — callers
   * translate that into `InvalidRefreshTokenError`. */
  verifyRefresh(token: string): { sub: string; sid: string } {
    return this.jwt.verify<{ sub: string; sid: string }>(token, {
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
