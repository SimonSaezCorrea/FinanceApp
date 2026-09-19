import { Inject, Injectable } from "@nestjs/common";

import {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from "../../session/domain/ports/session.repository.port";
import { InvalidRefreshTokenError } from "../domain/errors";
import { GeoIpLookup } from "./geoip-lookup";
import { parseDeviceLabel } from "./device-info";
import { TokenIssuer, type TokenPair } from "./token-issuer";

/** The bits of an HTTP request a session's `deviceLabel`/`country` are derived from —
 * threaded from the controller into whichever command ends up creating a session, so
 * the application layer never depends on Express's `Request` directly. */
export interface DeviceContext {
  userAgent?: string;
  ip?: string;
}

export interface EstablishSessionOptions extends DeviceContext {
  /** Reuse an existing session's id (a refresh rotating its tokens, research.md R6) —
   * omitted, a brand new `Session` row is created (a fresh login/registration). */
  reuseSessionId?: string;
}

/**
 * The ONE place that decides whether a login creates a new `Session` row or a refresh
 * reuses an existing one (research.md R13/R6) — every handler that can end with the
 * caller holding a session (Register/Login/VerifyMfaLogin/VerifyPasskeyLogin/Refresh)
 * goes through this instead of calling `TokenIssuer.issue` directly.
 */
@Injectable()
export class SessionIssuer {
  constructor(
    private readonly tokenIssuer: TokenIssuer,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    private readonly geoIp: GeoIpLookup,
  ) {}

  async establish(
    user: { id: string; email: string | null },
    opts: EstablishSessionOptions = {},
  ): Promise<TokenPair> {
    const tokens = this.tokenIssuer.issue(user, opts.reuseSessionId);

    if (opts.reuseSessionId) {
      const touched = await this.sessions.touch(
        tokens.sessionId,
        new Date(),
        tokens.sessionExpiresAt,
      );
      // The session behind this refresh token no longer exists (closed by the user
      // from another tab, or purged as expired) — treat exactly like any other
      // invalid refresh token, no new error code (contracts/session-endpoints.md).
      if (!touched) throw new InvalidRefreshTokenError();
      return tokens;
    }

    const location = await this.geoIp.lookup(opts.ip);
    await this.sessions.create({
      id: tokens.sessionId,
      userId: user.id,
      deviceLabel: parseDeviceLabel(opts.userAgent),
      country: location.country,
      city: location.city,
      expiresAt: tokens.sessionExpiresAt.toISOString(),
    });
    return tokens;
  }
}
