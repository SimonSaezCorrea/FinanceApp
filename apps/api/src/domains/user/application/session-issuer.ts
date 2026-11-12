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
  /** On a refresh: the jti of the refresh token presented (null for one issued before jtis). */
  presentedJti?: string | null;
  /** The passkey a new session is opened with (specs/041). */
  passkeyId?: string;
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

  /** Closes a session this issuer just opened (run-2: its passkey turned out compromised). */
  async revoke(sessionId: string): Promise<void> {
    await this.sessions.closeById(sessionId);
  }

  async establish(
    user: { id: string; email: string | null },
    opts: EstablishSessionOptions = {},
  ): Promise<TokenPair> {
    const tokens = this.tokenIssuer.issue(user, opts.reuseSessionId);

    if (opts.reuseSessionId) {
      const rotation = await this.sessions.rotateRefresh(
        tokens.sessionId,
        opts.presentedJti ?? null,
        tokens.refreshJti,
        new Date(),
        tokens.sessionExpiresAt,
      );
      // An old refresh token came back while its session is open (security run-3): someone else
      // holds a copy. The session closes, so neither copy works any more.
      if (rotation === "REUSED") await this.sessions.closeById(tokens.sessionId);
      // Closed elsewhere, purged, expired or past its maximum age — treat exactly like any other
      // invalid refresh token, no new error code (contracts/session-endpoints.md).
      if (rotation !== "ROTATED") throw new InvalidRefreshTokenError();
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
      passkeyId: opts.passkeyId ?? null,
      refreshJti: tokens.refreshJti,
    });
    return tokens;
  }
}
